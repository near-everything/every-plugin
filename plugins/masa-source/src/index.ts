import { implement } from "@orpc/server";
import { Effect } from "effect";
import { PluginConfigurationError, PluginLoggerTag, SimplePlugin } from "every-plugin";
import type { z } from "zod";
import { MasaApiError, MasaClient, type MasaSearchResult } from "./client";
import { JobManager } from "./job-manager";
import {
  type MasaSourceConfig,
  MasaSourceConfigSchema,
  masaContract,
  type SourceItem,
} from "./schemas";

// Simple helper to convert MasaApiError to oRPC errors using the errors helper
const handleMasaError = (error: unknown, errors: any): never => {
  if (error instanceof MasaApiError) {
    switch (error.status) {
      case 401:
        throw errors.UNAUTHORIZED({
          message: 'Invalid API key',
          data: { provider: 'masa', apiKeyProvided: true }
        });
      case 403:
        throw errors.FORBIDDEN({
          message: 'Access forbidden',
          data: { provider: 'masa' }
        });
      case 400:
        throw errors.BAD_REQUEST({
          message: 'Invalid request parameters',
          data: { provider: 'masa' }
        });
      case 404:
        throw errors.NOT_FOUND({
          message: 'Resource not found',
          data: { provider: 'masa' }
        });
      case 429:
        throw errors.TOO_MANY_REQUESTS({
          message: 'Rate limit exceeded',
          data: { retryAfter: 60, provider: 'masa' }
        });
      default: // 503 and others
        throw errors.SERVICE_UNAVAILABLE({
          message: 'Service temporarily unavailable',
          data: { provider: 'masa' }
        });
    }
  }

  // For non-MasaApiError, default to service unavailable
  throw errors.SERVICE_UNAVAILABLE({
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    data: { provider: 'masa' }
  });
};

// Helper function to convert Masa API results to plugin format
function convertMasaResultToSourceItem(masaResult: MasaSearchResult): SourceItem {
  return {
    externalId: masaResult.id,
    content: masaResult.content,
    contentType: "post",
    createdAt: masaResult.metadata?.created_at,
    url: masaResult.metadata?.tweet_id ? `https://twitter.com/i/status/${masaResult.metadata.tweet_id}` : undefined,
    authors: masaResult.metadata?.username ? [{
      id: masaResult.metadata?.user_id,
      username: masaResult.metadata?.username,
      displayName: masaResult.metadata?.author || masaResult.metadata?.username,
    }] : undefined,
    raw: masaResult,
  };
}

export class MasaSourcePlugin extends SimplePlugin<
  typeof masaContract,
  typeof MasaSourceConfigSchema
> {
  readonly id = "@curatedotfun/masa-source" as const;
  readonly type = "source" as const;
  readonly contract = masaContract;
  readonly configSchema = MasaSourceConfigSchema;

  // Export contract for client consumption
  static readonly contract = masaContract;

  private client: MasaClient | null = null;
  private jobManager: JobManager | null = null;

  // Initialize the Masa client - called by runtime after validation
  initialize(config: MasaSourceConfig) {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      const baseUrl = config.variables?.baseUrl as string || "https://data.masa.ai/api/v1";
      // Initialize Masa client
      self.client = new MasaClient(
        baseUrl,
        config.secrets.apiKey,
        config.variables?.timeout
      );

      // Initialize JobManager
      self.jobManager = new JobManager(self.client);

      // Test connection
      yield* Effect.tryPromise({
        try: () => self.client!.healthCheck(),
        catch: (error) => new PluginConfigurationError({
          message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          cause: error instanceof Error ? error : new Error(String(error))
        })
      });

      yield* logger.logDebug("Masa source plugin initialized successfully", {
        pluginId: self.id,
        baseUrl
      });
    });
  }

  // Create pure oRPC router following oRPC docs pattern
  createRouter() {
    const os = implement(masaContract);

    const submitSearchJob = os.submitSearchJob.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const jobId = await this.client.submitSearchJob(
          input.sourceType,
          input.searchMethod,
          input.query,
          input.maxResults,
          input.nextCursor
        );
        return { jobId };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const checkJobStatus = os.checkJobStatus.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const status = await this.client.checkJobStatus(input.jobId);
        return { status: status as 'submitted' | 'in progress' | 'done' | 'error' };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const getJobResults = os.getJobResults.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const masaResults = await this.client.getJobResults(input.jobId);
        const items = masaResults.map(convertMasaResultToSourceItem);
        return { items };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const getById = os.getById.handler(async ({ input, errors }) => {
      if (!this.jobManager) throw new Error("Plugin not initialized");

      try {
        const masaResult = await this.jobManager.getById(input.sourceType, input.id);
        const item = convertMasaResultToSourceItem(masaResult);
        return { item };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const getBulk = os.getBulk.handler(async ({ input, errors }) => {
      if (!this.jobManager) throw new Error("Plugin not initialized");

      try {
        const masaResults = await this.jobManager.getBulk(input.sourceType, input.ids);
        const items = masaResults.map(convertMasaResultToSourceItem);
        return { items };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const similaritySearch = os.similaritySearch.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const masaResults = await this.client.similaritySearch({
          query: input.query,
          sources: input.sources,
          keywords: input.keywords,
          keyword_operator: input.keywordOperator,
          max_results: input.maxResults,
        });

        const items = masaResults.map(convertMasaResultToSourceItem);
        return { items };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const hybridSearch = os.hybridSearch.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const masaResults = await this.client.hybridSearch({
          similarity_query: {
            query: input.similarityQuery.query,
            weight: input.similarityQuery.weight,
          },
          text_query: {
            query: input.textQuery.query,
            weight: input.textQuery.weight,
          },
          sources: input.sources,
          keywords: input.keywords,
          keyword_operator: input.keywordOperator,
          max_results: input.maxResults,
        });

        const items = masaResults.map(convertMasaResultToSourceItem);
        return { items };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const getProfile = os.getProfile.handler(async ({ input, errors }) => {
      if (!this.jobManager) throw new Error("Plugin not initialized");

      try {
        const profileData = await this.jobManager.executeJobWorkflow(
          input.sourceType,
          'searchbyprofile',
          input.username,
          1,
          (results) => {
            if (results.length === 0) {
              throw new MasaApiError(`Profile not found for ${input.username}`, 404, `Get profile ${input.username}`);
            }
            return results[0];
          }
        );

        return {
          profile: {
            id: profileData.id,
            username: input.username,
            displayName: profileData.metadata?.author || input.username,
            bio: profileData.metadata?.author,
            followersCount: undefined,
            followingCount: undefined,
            tweetsCount: undefined,
            verified: undefined,
            profileImageUrl: undefined,
            raw: profileData,
          }
        };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    const getTrends = os.getTrends.handler(async ({ input, errors }) => {
      if (!this.jobManager) throw new Error("Plugin not initialized");

      try {
        const results = await this.jobManager.executeJobWorkflow(
          input.sourceType,
          'gettrends',
          '',
          50,
          (results) => results
        );

        const trends = results.map(result => ({
          name: result.content,
          query: result.metadata?.username,
          tweetVolume: result.metadata?.likes,
          raw: result,
        }));

        return { trends };
      } catch (error) {
        return handleMasaError(error, errors);
      }
    });

    return os.router({
      submitSearchJob,
      checkJobStatus,
      getJobResults,
      getById,
      getBulk,
      similaritySearch,
      hybridSearch,
      getProfile,
      getTrends,
    });
  }

  shutdown() {
    this.client = null;
    return Effect.void;
  }
}

export default MasaSourcePlugin;
