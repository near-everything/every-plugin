import { implement } from "@orpc/server";
import { Duration, Effect } from "effect";
import { PluginConfigurationError, PluginLoggerTag, SimplePlugin } from "every-plugin";
import { MasaApiError, MasaClient, type MasaSearchResult } from "./client";
import { JobManager } from "./job-manager";
import {
  masaContract,
  type MasaSourceConfig,
  MasaSourceConfigSchema,
  type SourceItem,
  stateSchema,
  type StreamState
} from "./schemas";


// Constants
const BACKFILL_PAGE_SIZE = 100;
const LIVE_PAGE_SIZE = 20;

// Simplified state transitions
const StateTransitions = {
  fromInitial: (items: SourceItem[]): 'backfill' | 'live' =>
    items.length > 0 ? 'backfill' : 'live',

  fromBackfill: (items: SourceItem[], hasReachedLimit: boolean): 'backfill' | 'live' =>
    items.length < BACKFILL_PAGE_SIZE || hasReachedLimit ? 'live' : 'backfill',

  fromLive: (): 'live' => 'live'
};

// Resume strategy detection
const ResumeStrategy = {
  shouldCheckForNewContent: (state: StreamState): boolean =>
    state.phase === 'live' && state.mostRecentId !== undefined,

  shouldContinueBackfill: (state: StreamState, input: any): boolean =>
    state.oldestSeenId !== undefined && 
    (!input.maxResults || (state.totalProcessed || 0) < input.maxResults),

  getResumePhase: (state: StreamState, input: any): 'live' | 'backfill' | 'hybrid' => {
    const hasNewContent = ResumeStrategy.shouldCheckForNewContent(state);
    const canBackfill = ResumeStrategy.shouldContinueBackfill(state, input);
    
    if (hasNewContent && canBackfill) return 'hybrid';
    if (hasNewContent) return 'live';
    if (canBackfill) return 'backfill';
    return 'live';
  }
};

// Query builders for different scenarios
const buildQuery = (baseQuery: string, state: StreamState | null, searchPhase?: 'live' | 'backfill'): string => {
  let query = baseQuery;
  
  if (searchPhase === 'live' && state?.mostRecentId) {
    query += ` since_id:${state.mostRecentId}`;
  } else if (searchPhase === 'backfill' && state?.oldestSeenId) {
    const maxId = decrementSnowflakeId(state.oldestSeenId);
    query += ` max_id:${maxId}`;
  } else if (!searchPhase) {
    // Legacy behavior for backward compatibility
    if (state?.phase === 'backfill' && state.oldestSeenId) {
      const maxId = decrementSnowflakeId(state.oldestSeenId);
      query += ` max_id:${maxId}`;
    } else if (state?.phase === 'live' && state.mostRecentId) {
      query += ` since_id:${state.mostRecentId}`;
    }
  }
  
  return query;
};

// Simple helper functions
const decrementSnowflakeId = (id: string): string => {
  try {
    const snowflake = BigInt(id);
    return snowflake <= 0n ? id : (snowflake - 1n).toString();
  } catch {
    return id;
  }
};

const getIdBounds = (items: SourceItem[]): { minId: string; maxId: string } => {
  const ids = items.map(item => BigInt(item.externalId)).sort((a, b) => a < b ? -1 : 1);
  return { minId: ids[0].toString(), maxId: ids[ids.length - 1].toString() };
};

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
  // Helper to convert snowflake ID to timestamp for fallback
  const snowflakeToTimestamp = (id: striYng): string => {
    const TWITTER_EPOCH = 1288834974657n;
    const snowflake = BigInt(id);
    const timestamp = Number((snowflake >> 22n) + TWITTER_EPOCH);
    return new Date(timestamp).toISOString();
  };

  // Helper to validate timestamp - reject sentinel values and invalid dates
  const isValidTimestamp = (timestamp: string | undefined): boolean => {
    if (!timestamp) return false;
    if (timestamp === "0001-01-01T00:00:00Z") return false; // Masa sentinel value

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return false;

    // Reject dates before Twitter's epoch (2010-11-04)
    const twitterEpochDate = new Date("2010-11-04T00:00:00Z");
    return date >= twitterEpochDate;
  };

  // Use provided createdAt if valid, otherwise derive from snowflake ID
  const createdAt = isValidTimestamp(masaResult.metadata?.created_at)
    ? masaResult.metadata!.created_at
    : snowflakeToTimestamp(masaResult.id);

  return {
    externalId: masaResult.id,
    content: masaResult.content,
    contentType: "post",
    createdAt,
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
  typeof stateSchema
> {
  readonly id = "@curatedotfun/masa-source" as const;
  readonly type = "source" as const;
  readonly contract = masaContract;
  readonly configSchema = MasaSourceConfigSchema;
  readonly stateSchema = stateSchema;

  static readonly contract = masaContract;

  private client: MasaClient | null = null;
  private jobManager: JobManager | null = null;

  initialize(config: MasaSourceConfig) {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      const baseUrl = config.variables?.baseUrl as string || "https://data.masa.ai/api/v1";
      self.client = new MasaClient(
        baseUrl,
        config.secrets.apiKey,
        config.variables?.timeout
      );

      self.jobManager = new JobManager(self.client);

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

  createRouter() {
    const os = implement(masaContract).$context<{ state: StreamState | null }>();

    const submitSearchJob = os.submitSearchJob.handler(async ({ input, errors }) => {
      if (!this.client) throw new Error("Plugin not initialized");

      try {
        const jobId = await this.client.submitSearchJob(
          input.sourceType,
          input.searchMethod,
          input.query,
          100,
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

    // Main search handler
    const search = os.search.handler(async ({ input, context, errors }) => {
      if (!this.jobManager) throw new Error("Plugin not initialized");
      const self = this;

      try {
        // Determine if we're resuming or starting fresh
        const existingState = context?.state;
        const isResume = existingState && existingState.phase !== 'initial';

        let currentState: StreamState;
        let searchPhase: 'live' | 'backfill';
        let pageSize: number;

        if (isResume) {
          // Resume from existing state
          currentState = { ...existingState };
          const resumePhase = ResumeStrategy.getResumePhase(currentState, input);
          
          // For hybrid resume, prioritize checking for new content first
          searchPhase = resumePhase === 'hybrid' ? 'live' : resumePhase;
          pageSize = searchPhase === 'live' ? LIVE_PAGE_SIZE : BACKFILL_PAGE_SIZE;
          
          console.log(`[Search] Resuming from phase: ${currentState.phase}, strategy: ${resumePhase}, searching: ${searchPhase}`);
        } else {
          // Fresh search
          currentState = {
            phase: 'initial',
            backfillDone: false,
            totalProcessed: 0,
          };
          searchPhase = 'backfill'; // Start with backfill for fresh searches
          pageSize = BACKFILL_PAGE_SIZE;
          console.log(`[Search] Starting fresh search, maxResults: ${input.maxResults}`);
        }

        // Build query based on phase
        const query = buildQuery(input.query, currentState, searchPhase);
        console.log(`[Search] Query: "${query}", Phase: ${searchPhase}, PageSize: ${pageSize}`);

        // Execute search with Effect.TS timeout
        const searchEffect = Effect.gen(function* () {
          const results = yield* Effect.tryPromise({
            try: () => self.jobManager!.executeJobWorkflow(
              input.sourceType,
              input.searchMethod,
              query,
              pageSize,
              (results) => results
            ),
            catch: (error) => error instanceof Error ? error : new Error(String(error))
          });

          return results;
        });

        const results = await Effect.runPromise(
          searchEffect.pipe(
            Effect.timeout(Duration.millis(input.budgetMs)),
            Effect.catchTag("TimeoutException", () =>
              Effect.fail(new Error('Search budget exceeded - increase budgetMs parameter'))
            )
          )
        );

        // Convert and sort results (oldest first)
        const items = results
          .map(convertMasaResultToSourceItem)
          .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

        console.log(`[Search] Retrieved ${items.length} items`);

        // Check if we've hit the maxResults limit (only applies to backfill, not live polling)
        const hasReachedLimit = searchPhase === 'backfill' && 
          input.maxResults !== undefined &&
          (currentState.totalProcessed + items.length) >= input.maxResults;

        // Truncate items if we exceed maxResults during backfill
        const finalItems = hasReachedLimit && input.maxResults !== undefined
          ? items.slice(0, input.maxResults - currentState.totalProcessed)
          : items;

        // Update state based on current context
        const nextState: StreamState = {
          totalProcessed: currentState.totalProcessed + finalItems.length,
          backfillDone: currentState.backfillDone || false,
          phase: currentState.phase,
          nextPollMs: 0,
          mostRecentId: currentState.mostRecentId,
          oldestSeenId: currentState.oldestSeenId,
        };

        if (finalItems.length > 0) {
          const { minId, maxId } = getIdBounds(finalItems);

          if (searchPhase === 'live') {
            // Update mostRecentId for live search
            nextState.mostRecentId = maxId;
            nextState.phase = 'live';
            nextState.nextPollMs = input.livePollMs;
          } else {
            // Update oldestSeenId for backfill search
            nextState.oldestSeenId = minId;
            
            if (!nextState.mostRecentId) {
              // First time seeing content, set mostRecentId
              nextState.mostRecentId = maxId;
            }
            
            // Determine next phase
            if (currentState.phase === 'initial') {
              nextState.phase = StateTransitions.fromInitial(finalItems);
            } else {
              nextState.phase = StateTransitions.fromBackfill(finalItems, hasReachedLimit);
            }
            
            nextState.nextPollMs = nextState.phase === 'live' ? input.livePollMs : 0;
            nextState.backfillDone = nextState.phase === 'live';
          }
        } else {
          // No items returned
          if (searchPhase === 'live') {
            const canBackfill = ResumeStrategy.shouldContinueBackfill(currentState, input);
            if (canBackfill && !currentState.backfillDone) {
              nextState.phase = 'backfill';
              nextState.nextPollMs = 0;
            } else {
              nextState.phase = 'live';
              nextState.nextPollMs = input.livePollMs;
              nextState.backfillDone = true;
            }
          } else {
            // Backfill exhausted, switch to live
            nextState.phase = 'live';
            nextState.backfillDone = true;
            nextState.nextPollMs = input.livePollMs;
          }
        }

        console.log(`[Search] Next phase: ${nextState.phase}, nextPollMs: ${nextState.nextPollMs}`);

        return {
          items: finalItems,
          nextState
        };

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
      search,
    });
  }

  shutdown() {
    this.client = null;
    return Effect.void;
  }
}

export default MasaSourcePlugin;
