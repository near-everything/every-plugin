import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { GopherAIClient } from "./client";
import { contract } from "./contract";
import { GopherAIService } from "./service";

export default createPlugin({
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

    const service = new GopherAIService(client);

    yield* service.healthCheck();

    return { service };
  }),

  shutdown: () => Effect.void,

  createRouter: (context, builder) => {
    const { service } = context;

    // Core job operations
    const submitSearchJob = builder.submitSearchJob.handler(async ({ input }) => {
      const jobId = await Effect.runPromise(
        service.client.submitSearchJob(
          input.sourceType,
          input.searchMethod,
          input.query,
          100,
          input.nextCursor
        )
      );
      return { jobId };
    });

    const checkJobStatus = builder.checkJobStatus.handler(async ({ input }) => {
      const status = await Effect.runPromise(service.client.checkJobStatus(input.jobId));
      return { status: status as 'submitted' | 'in progress' | 'done' | 'error' };
    });

    const getJobResults = builder.getJobResults.handler(async ({ input }) => {
      const results = await Effect.runPromise(service.client.getJobResults(input.jobId));
      return { items: results };
    });

    const getById = builder.getById.handler(async ({ input }) => {
      const result = await Effect.runPromise(
        service.getById(input.sourceType, input.id)
      );
      return { item: result };
    });

    const getBulk = builder.getBulk.handler(async ({ input }) => {
      const results = await Effect.runPromise(
        service.getBulk(input.sourceType, input.ids)
      );
      return { items: results };
    });

    const getReplies = builder.getReplies.handler(async ({ input }) => {
      const results = await Effect.runPromise(
        service.getReplies(
          input.sourceType,
          input.conversationId,
          input.maxResults || 20
        )
      );
      return { replies: results };
    });

    const similaritySearch = builder.similaritySearch.handler(async ({ input }) => {
      const results = await Effect.runPromise(
        service.similaritySearch(
          input.query,
          input.sources,
          input.keywords,
          input.keywordOperator,
          input.maxResults
        )
      );

      return { items: results };
    });

    const hybridSearch = builder.hybridSearch.handler(async ({ input }) => {
      const results = await Effect.runPromise(
        service.hybridSearch(
          input.similarityQuery,
          input.textQuery,
          input.sources,
          input.keywords,
          input.keywordOperator,
          input.maxResults
        )
      );

      return { items: results };
    });

    const getProfile = builder.getProfile.handler(async ({ input }) => {
      const profileData = await Effect.runPromise(
        service.getProfile(input.sourceType, input.username)
      );

      // Type guard for author field from metadata
      const author = typeof profileData.metadata?.author === 'string'
        ? profileData.metadata.author
        : null;

      return {
        profile: {
          id: profileData.id,
          username: input.username,
          displayName: author || input.username,
          bio: author || undefined,
          followersCount: undefined,
          followingCount: undefined,
          tweetsCount: undefined,
          verified: undefined,
          profileImageUrl: undefined,
          raw: profileData,
        }
      };
    });

    const getTrends = builder.getTrends.handler(async ({ input }) => {
      const results = await Effect.runPromise(
        service.getTrends(input.sourceType)
      );

      const trends = results.map((result) => ({
        name: result.content,
        query: typeof result.metadata?.username === 'string'
          ? result.metadata.username
          : undefined,
        tweetVolume: typeof result.metadata?.likes === 'number'
          ? result.metadata.likes
          : undefined,
        raw: result,
      }));

      return { trends };
    });

    const search = builder.search.handler(async function* ({ input }) {
      yield* service.searchAndStream(
        input.query,
        input.sourceType,
        input.sinceId,
        input.maxId,
        input.maxBackfillResults,
        input.oldestAllowedId,
        input.maxBackfillAgeMs,
        input.backfillPageSize,
        input.enableLive,
        input.livePageSize,
        input.livePollMs
      );
    });

    const backfill = builder.backfill.handler(async function* ({ input }) {
      yield* service.backfill(
        input.query,
        input.sourceType,
        input.searchMethod,
        input.maxId,
        input.maxResults,
        undefined, // no oldestAllowedId
        undefined, // no age limit
        input.pageSize
      );
    });

    const live = builder.live.handler(async function* ({ input }) {
      yield* service.live(
        input.query,
        input.sourceType,
        input.searchMethod,
        input.sinceId,
        undefined, // no maxResults
        input.pageSize,
        input.pollMs
      );
    });

    return {
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
    };
  },
});
