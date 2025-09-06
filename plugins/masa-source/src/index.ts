import { implement } from "@orpc/server";
import { Effect } from "effect";
import { ConfigurationError, PluginLoggerTag, SimplePlugin } from "every-plugin";
import type { z } from "zod";
import { MasaClient, type MasaSearchResult } from "./client";
import {
  type MasaSourceConfig,
  MasaSourceConfigSchema,
  masaContract, 
  type SourceItem,
  StateSchema
} from "./schemas";

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
  typeof MasaSourceConfigSchema,
  typeof StateSchema
> {
  readonly id = "@curatedotfun/masa-source" as const;
  readonly type = "source" as const;
  readonly contract = masaContract;
  readonly configSchema = MasaSourceConfigSchema;
  readonly stateSchema = StateSchema;

  // Export contract for client consumption
  static readonly contract = masaContract;

  private client: MasaClient | null = null;

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

      // Test connection
      yield* Effect.tryPromise({
        try: () => self.client!.healthCheck(),
        catch: (error) => new ConfigurationError(`Health check failed: ${error instanceof Error ? error.message : String(error)}`)
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

    // Create context type for state injection
    type ContextWithState = { state?: z.infer<typeof StateSchema> };
    const osWithContext = os.$context<ContextWithState>();

    // State injection middleware for streaming procedures
    const stateMiddleware = osWithContext.middleware(async ({ context, next }) => {
      return next({
        context: {
          state: context.state
        }
      });
    });

    // Define individual procedure handlers
    const getById = osWithContext.getById.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const masaResult = await this.client.getById(input.sourceType, input.id);
      const item = convertMasaResultToSourceItem(masaResult);
      return { item };
    });

    const getBulk = osWithContext.getBulk.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const masaResults = await this.client.getBulk(input.sourceType, input.ids);
      const items = masaResults.map(convertMasaResultToSourceItem);
      return { items };
    });

    const search = osWithContext.use(stateMiddleware).search.handler(async ({ input, context }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const state = context.state;

      // Phase 1: Submit new job if no state
      if (!state) {

        try {
          const jobId = await this.client.submitSearchJob(
            input.sourceType,
            input.searchMethod,
            input.query,
            input.maxResults,
            input.nextCursor
          );

          const initialState: z.infer<typeof StateSchema> = {
            phase: "submitted",
            jobId,
            searchMethod: input.searchMethod,
            sourceType: input.sourceType,
            nextPollMs: 10,
            lastProcessedId: undefined,
            nextCursor: undefined,
            errorMessage: undefined,
          };

          return {
            items: [],
            nextState: initialState
          };
        } catch (error) {
          const errorState: z.infer<typeof StateSchema> = {
            phase: "error",
            errorMessage: error instanceof Error ? error.message : String(error),
            nextPollMs: null,
            jobId: undefined,
            searchMethod: undefined,
            sourceType: undefined,
            lastProcessedId: undefined,
            nextCursor: undefined,
          };

          return {
            items: [],
            nextState: errorState
          };
        }
      }

      // Phase 2: Check job status and handle completion
      if (state.jobId) {

        try {
          const status = await this.client.checkJobStatus(
            state.jobId
          );


          if (status === 'done') {

            try {
              const masaResults = await this.client.getJobResults(
                state.jobId
              );

              const items = masaResults.map(convertMasaResultToSourceItem);

              const doneState: z.infer<typeof StateSchema> = {
                ...state,
                phase: "done",
                nextPollMs: 0,
                lastProcessedId: items.length > 0 ? items[items.length - 1].externalId : undefined,
              };

              return {
                items,
                nextState: doneState
              };
            } catch (resultsError) {
              const errorState: z.infer<typeof StateSchema> = {
                ...state,
                phase: "error",
                errorMessage: resultsError instanceof Error ? resultsError.message : String(resultsError),
                nextPollMs: null,
              };

              return {
                items: [],
                nextState: errorState
              };
            }
          } else if (status === 'error') {
            const errorState: z.infer<typeof StateSchema> = {
              ...state,
              phase: "error",
              errorMessage: "Job failed",
              nextPollMs: null,
            };

            return {
              items: [],
              nextState: errorState
            };
          } else {
            const processingState: z.infer<typeof StateSchema> = {
              ...state,
              phase: "processing",
              nextPollMs: 20,
            };

            return {
              items: [],
              nextState: processingState
            };
          }
        } catch (statusError) {
          const errorState: z.infer<typeof StateSchema> = {
            ...state,
            phase: "error",
            errorMessage: statusError instanceof Error ? statusError.message : String(statusError),
            nextPollMs: null,
          };

          return {
            items: [],
            nextState: errorState
          };
        }
      }

      // Fallback: return empty results
      return {
        items: [],
        nextState: null
      };
    });

    const similaritySearch = osWithContext.similaritySearch.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const masaResults = await this.client.similaritySearch({
        query: input.query,
        sources: input.sources,
        keywords: input.keywords,
        keyword_operator: input.keywordOperator,
        max_results: input.maxResults,
      });

      const items = masaResults.map(convertMasaResultToSourceItem);
      return { items };
    });

    const hybridSearch = osWithContext.hybridSearch.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

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
    });

    const getProfile = osWithContext.getProfile.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const jobId = await this.client.submitSearchJob(
        input.sourceType,
        'searchbyprofile',
        input.username,
        1
      );

      // Poll for completion
      let status = 'submitted';
      let attempts = 0;
      const maxAttempts = 30;

      while (status !== 'done' && status !== 'error' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10));
        status = await this.client.checkJobStatus(jobId);
        attempts++;
      }

      if (status !== 'done') {
        throw new Error(`Profile fetch failed or timed out for ${input.username}`);
      }

      const results = await this.client.getJobResults(jobId);

      if (results.length === 0) {
        throw new Error(`Profile not found for ${input.username}`);
      }

      const profileData = results[0];

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
    });

    const getTrends = osWithContext.getTrends.handler(async ({ input }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      const jobId = await this.client.submitSearchJob(
        input.sourceType,
        'gettrends',
        '',
        50
      );

      // Poll for completion
      let status = 'submitted';
      let attempts = 0;
      const maxAttempts = 30;

      while (status !== 'done' && status !== 'error' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10));
        status = await this.client.checkJobStatus(jobId);
        attempts++;
      }

      if (status !== 'done') {
        throw new Error('Trends fetch failed or timed out');
      }

      const results = await this.client.getJobResults(jobId);

      const trends = results.map(result => ({
        name: result.content,
        query: result.metadata?.username,
        tweetVolume: result.metadata?.likes,
        raw: result,
      }));

      return { trends };
    });

    return osWithContext.router({
      getById,
      getBulk,
      search,
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
