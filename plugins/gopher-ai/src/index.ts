import { implement } from "@orpc/server";
import { createPlugin, PluginConfigurationError } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { ApiError, GopherAIClient } from "./client";
import { JobManager } from "./job-manager";
import {
  contract
} from "./schemas";
import {
  backfillStream,
  gapDetectionAndLiveStream,
  liveStream
} from "./streaming";
import {
  convertResultToSourceItem,
  handleError
} from "./utils";

export default createPlugin({
  id: "@curatedotfun/gopher-ai",

  variables: z.object({
    baseUrl: z.string().url().optional().default("https://data.gopher-ai.com/api/v1"),
    timeout: z.number().optional().default(30000),
  }),

  secrets: z.object({
    apiKey: z.string().min(1, " API key is required"),
  }),

  contract: contract,

  initialize: (config) => Effect.gen(function* () {
    const baseUrl = config.variables?.baseUrl || "https://data.gopher-ai.com/api/v1";
    const client = new GopherAIClient(
      baseUrl,
      config.secrets.apiKey,
      config.variables?.timeout
    );

    const jobManager = new JobManager(client);

    yield* Effect.tryPromise({
      try: () => client.healthCheck(),
      catch: (error) => new PluginConfigurationError({
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: false,
        cause: error instanceof Error ? error : new Error(String(error))
      })
    });

    console.log(" source plugin initialized successfully", {
      pluginId: "@curatedotfun/gopher-ai",
      baseUrl
    });

    return { client, jobManager };
  }),

  createRouter: (context) => {
    const os = implement(contract);

    // Core job operations
    const submitSearchJob = os.submitSearchJob.handler(async ({ input, errors }) => {
      try {
        const jobId = await context.client.submitSearchJob(
          input.sourceType,
          input.searchMethod,
          input.query,
          100,
          input.nextCursor
        );
        return { jobId };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const checkJobStatus = os.checkJobStatus.handler(async ({ input, errors }) => {
      try {
        const status = await context.client.checkJobStatus(input.jobId);
        return { status: status as 'submitted' | 'in progress' | 'done' | 'error' };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const getJobResults = os.getJobResults.handler(async ({ input, errors }) => {
      try {
        const results = await context.client.getJobResults(input.jobId);
        const items = results.map(convertResultToSourceItem);
        return { items };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const getById = os.getById.handler(async ({ input, errors }) => {
      try {
        const result = await context.jobManager.getById(input.sourceType, input.id);
        const item = convertResultToSourceItem(result);
        return { item };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const getBulk = os.getBulk.handler(async ({ input, errors }) => {
      try {
        const results = await context.jobManager.getBulk(input.sourceType, input.ids);
        const items = results.map(convertResultToSourceItem);
        return { items };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const getReplies = os.getReplies.handler(async ({ input, errors }) => {
      try {
        const results = await Effect.runPromise(
          context.jobManager.executeJobWorkflow(
            input.sourceType,
            'getreplies',
            input.conversationId,
            input.maxResults || 20,
            (results) => results
          )
        );
        const replies = results.map(convertResultToSourceItem);
        return { replies };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const similaritySearch = os.similaritySearch.handler(async ({ input, errors }) => {
      try {
        const results = await context.client.similaritySearch({
          query: input.query,
          sources: input.sources,
          keywords: input.keywords,
          keyword_operator: input.keywordOperator,
          max_results: input.maxResults,
        });

        const items = results.map(convertResultToSourceItem);
        return { items };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const hybridSearch = os.hybridSearch.handler(async ({ input, errors }) => {
      try {
        const results = await context.client.hybridSearch({
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

        const items = results.map(convertResultToSourceItem);
        return { items };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    const getProfile = os.getProfile.handler(async ({ input, errors }) => {
      try {
        const profileData = await Effect.runPromise(
          context.jobManager.executeJobWorkflow(
            input.sourceType,
            'searchbyprofile',
            input.username,
            1,
            (results) => {
              if (results.length === 0) {
                throw new ApiError(`Profile not found for ${input.username}`, 404, `Get profile ${input.username}`);
              }
              return results[0];
            }
          )
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
        return handleError(error, errors);
      }
    });

    const getTrends = os.getTrends.handler(async ({ input, errors }) => {
      try {
        const results = await Effect.runPromise(
          context.jobManager.executeJobWorkflow(
            input.sourceType,
            'gettrends',
            '',
            50,
            (results) => results
          )
        );

        const trends = results.map((result) => ({
          name: result.content,
          query: result.metadata?.username,
          tweetVolume: result.metadata?.likes,
          raw: result,
        }));

        return { trends };
      } catch (error) {
        return handleError(error, errors);
      }
    });

    // Unified search stream (backfill → gap detection → live)
    const search = os.search.handler(async function* ({ input, errors }) {
      try {
        let mostRecentId: string | undefined = input.sinceId;

        // Phase 1: Backfill (skip if sinceId provided - means resuming after a gap was detected)
        if (!input.sinceId) {
          for await (const item of backfillStream(
            context.jobManager,
            input.query,
            input.sourceType,
            input.searchMethod,
            input.maxId,
            input.maxBackfillResults,
            input.oldestAllowedId,
            input.maxBackfillAgeMs,
            input.backfillPageSize
          )) {
            yield item;

            const itemId = BigInt(item.externalId);
            if (!mostRecentId || itemId > BigInt(mostRecentId)) {
              mostRecentId = item.externalId;
            }
          }
        }

        // Phase 2: Gap detection and live streaming
        if (!input.enableLive) return; // Can finish after backfill

        yield* gapDetectionAndLiveStream(
          context.jobManager,
          input.query,
          input.sourceType,
          input.searchMethod,
          mostRecentId,
          input.livePageSize,
          input.livePollMs
        );

      } catch (error) {
        handleError(error, errors);
      }
    });

    // Backfill only stream
    const backfill = os.backfill.handler(async function* ({ input, errors }) {
      try {
        for await (const item of backfillStream(
          context.jobManager,
          input.query,
          input.sourceType,
          input.searchMethod,
          input.maxId,
          input.maxResults,
          undefined, // no oldestAllowedId
          undefined, // no age limit
          input.pageSize
        )) {
          yield item;
        }
      } catch (error) {
        handleError(error, errors);
      }
    });

    // Live polling only stream
    const live = os.live.handler(async function* ({ input, errors }) {
      try {
        for await (const item of liveStream(
          context.jobManager,
          input.query,
          input.sourceType,
          input.searchMethod,
          input.sinceId,
          undefined,
          input.pageSize,
          input.pollMs
        )) {
          yield item;
        }
      } catch (error) {
        handleError(error, errors);
      }
    });

    return os.router({
      submitSearchJob,
      checkJobStatus,
      getJobResults,
      getById,
      getReplies,
      getBulk,
      similaritySearch,
      hybridSearch,
      getProfile,
      getTrends,
      search,
      backfill,
      live,
    });
  },
});
