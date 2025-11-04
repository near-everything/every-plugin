import { Effect } from "every-plugin/effect";
import type { GopherAIClient } from "./client";
import { ApiError } from "./client";
import type { GopherResult, SearchMethod, SourceType } from "./contract";
import { buildBackfillQuery, buildLiveQuery } from "./utils";

export class GopherAIService {
  constructor(public readonly client: GopherAIClient) { }

  query<T>(
    sourceType: SourceType,
    searchMethod: SearchMethod,
    query: string,
    maxResults: number,
    transform: (results: GopherResult[]) => T
  ) {
    const client = this.client;
    return Effect.gen(function* () {
      const jobId = yield* client.submitSearchJob(
        sourceType,
        searchMethod,
        query,
        maxResults
      );

      console.log(`[SEARCH] searchMethod: "${searchMethod}" (max: ${maxResults})`);
      console.log(`[SEARCH] Query: ${query}`);

      let status = "submitted";
      while (status === "submitted" || status === "in progress") {
        yield* Effect.sleep("2 seconds");
        status = yield* client.checkJobStatus(jobId);
      }

      if (status === "error") {
        throw new ApiError(`Job ${jobId} failed`, 500, "Job execution");
      }

      // Handle jobs that completed with no results
      if (status === "empty") {
        console.log(`[COMPLETE] Job ${jobId} - no results`);
        return transform([]);
      }

      console.log(`[COMPLETE] Job ${jobId}`);

      const results = yield* client.getJobResults(jobId);
      return transform(results);
    });
  }

  getById(sourceType: SourceType, id: string) {
    return this.query(sourceType, "getbyid", id, 1, (results) => {
      const item = results[0];
      if (!item) {
        throw new ApiError(`Item not found: ${id}`, 404, "Get by ID");
      }
      return item;
    });
  }

  getBulk(sourceType: SourceType, ids: string[]) {
    return this.query(
      sourceType,
      "getbyid",
      ids.join(","),
      ids.length,
      (results) => results
    );
  }

  getReplies(
    sourceType: SourceType,
    conversationId: string,
    maxResults: number
  ) {
    return this.query(
      sourceType,
      "getreplies",
      conversationId,
      maxResults,
      (results) => results
    );
  }

  getProfile(sourceType: SourceType, username: string) {
    return this.query(sourceType, "searchbyprofile", username, 1, (results) => {
      const profile = results[0];
      if (!profile) {
        throw new ApiError(`Profile not found: ${username}`, 404, "Get profile");
      }
      return profile;
    });
  }

  getTrends(sourceType: SourceType) {
    return this.query(sourceType, "gettrends", "", 50, (results) => results);
  }

  similaritySearch(
    query: string,
    sources?: string[],
    keywords?: string[],
    keywordOperator?: "and" | "or",
    maxResults = 10
  ) {
    return this.client.similaritySearch({
      query,
      sources,
      keywords,
      keyword_operator: keywordOperator,
      max_results: maxResults,
    });
  }

  hybridSearch(
    similarityQuery: { query: string; weight: number },
    textQuery: { query: string; weight: number },
    sources?: string[],
    keywords?: string[],
    keywordOperator?: "and" | "or",
    maxResults = 10
  ) {
    return this.client.hybridSearch({
      similarity_query: similarityQuery,
      text_query: textQuery,
      sources,
      keywords,
      keyword_operator: keywordOperator,
      max_results: maxResults,
    });
  }

  async *backfill(
    baseQuery: string,
    sourceType: SourceType,
    searchMethod: SearchMethod,
    maxId: string | undefined,
    maxResults: number | undefined,
    oldestAllowedId: string | undefined,
    maxBackfillAgeMs: number | undefined,
    pageSize: number
  ): AsyncGenerator<GopherResult> {
    let oldestSeenId = maxId;
    let totalYielded = 0;
    const cutoffTime = maxBackfillAgeMs
      ? Date.now() - maxBackfillAgeMs
      : undefined;

    while (true) {
      if (maxResults && totalYielded >= maxResults) break;

      const query = buildBackfillQuery(baseQuery, oldestSeenId);
      const items = await Effect.runPromise(
        this.query(sourceType, searchMethod, query, pageSize, (results) => results)
      );

      if (items.length === 0) break;

      for (const item of items) {
        if (maxResults && totalYielded >= maxResults) break;

        // For backfill, we need to sort by age (newest to oldest)
        // For simplicity, assume items come sorted or sort by id (largest first = newest)
        if (cutoffTime && item.updated_at && new Date(item.updated_at).getTime() < cutoffTime) break;
        if (oldestAllowedId && BigInt(item.id) < BigInt(oldestAllowedId)) break;

        yield item;
        totalYielded++;

        const itemId = BigInt(item.id);
        if (!oldestSeenId || itemId < BigInt(oldestSeenId)) {
          oldestSeenId = item.id;
        }
      }

      if (items.length < pageSize) break;
    }
  }

  async *live(
    baseQuery: string,
    sourceType: SourceType,
    searchMethod: SearchMethod,
    sinceId: string | undefined,
    maxResults: number | undefined,
    pageSize: number,
    pollMs: number
  ): AsyncGenerator<GopherResult> {
    let mostRecentId = sinceId;
    let totalYielded = 0;

    while (true) {
      if (maxResults && totalYielded >= maxResults) break;

      const query = buildLiveQuery(baseQuery, mostRecentId);
      const items = await Effect.runPromise(
        this.query(sourceType, searchMethod, query, pageSize, (results) => results)
      );

      for (const item of items) {
        if (maxResults && totalYielded >= maxResults) break;

        yield item;
        totalYielded++;

        const itemId = BigInt(item.id);
        if (!mostRecentId || itemId > BigInt(mostRecentId)) {
          mostRecentId = item.id;
        }
      }

      const nextPollTime = new Date(Date.now() + pollMs).toLocaleTimeString();
      console.log(`[LIVE] Next poll in ${pollMs}ms (at ${nextPollTime})`);

      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  }

  async *searchAndStream(
    query: string,
    sourceType: SourceType,
    sinceId: string | undefined,
    maxId: string | undefined,
    maxBackfillResults: number | undefined,
    oldestAllowedId: string | undefined,
    maxBackfillAgeMs: number | undefined,
    backfillPageSize: number,
    enableLive: boolean,
    livePageSize: number,
    livePollMs: number
  ): AsyncGenerator<GopherResult> {
    let mostRecentId = sinceId;
    let oldestSeenId = maxId;

    // Phase 1: Check for new content (gap detection)
    if (mostRecentId) {
      console.log(`[SEARCH] Phase 1: Checking for new content since: ${mostRecentId}`);

      const gapQuery = `${query} since_id:${mostRecentId}`;
      console.log(`[GAP CHECK] Query: ${gapQuery}`);

      const gapResult = await Effect.runPromise(
        this.query(sourceType, 'searchbyquery', gapQuery, 20, (results) => results)
      );

      if (gapResult.length > 0) {
        console.log(`[GAP CHECK] Found ${gapResult.length} new items`);

        for (const item of gapResult) {
          yield item;
        }

        // Update mostRecentId from gap items
        const gapIds = gapResult.map(item => BigInt(item.id)).sort((a, b) => (b < a ? -1 : 1));
        if (gapIds.length > 0 && (!mostRecentId || gapIds[0]! > BigInt(mostRecentId))) {
          mostRecentId = gapIds[0]!.toString();
        }
      } else {
        console.log(`[GAP CHECK] No new items found`);
      }
    }

    // Phase 2: Backfill (if requested)
    const shouldBackfill = !sinceId || (maxBackfillResults && maxBackfillResults > 0);

    if (shouldBackfill) {
      console.log(`[SEARCH] Phase 2: Backfill starting from maxId: ${oldestSeenId || 'beginning'}`);

      for await (const item of this.backfill(
        query,
        sourceType,
        'searchbyfullarchive',
        oldestSeenId,
        maxBackfillResults,
        oldestAllowedId,
        maxBackfillAgeMs,
        backfillPageSize
      )) {
        yield item;

        // Track cursors during backfill
        const itemId = BigInt(item.id);
        if (!mostRecentId || itemId > BigInt(mostRecentId)) {
          mostRecentId = item.id;
        }
        if (!oldestSeenId || itemId < BigInt(oldestSeenId)) {
          oldestSeenId = item.id;
        }
      }

      console.log(`[SEARCH] Backfill complete. Cursors: mostRecent=${mostRecentId}, oldest=${oldestSeenId}`);
    }

    // Phase 3: Live streaming
    if (!enableLive) return;

    console.log(`[SEARCH] Phase 3: Live mode starting with sinceId: ${mostRecentId}`);

    yield* this.live(
      query,
      sourceType,
      'searchbyquery',
      mostRecentId,
      undefined, // no maxResults for live
      livePageSize,
      livePollMs
    );
  }

  healthCheck() {
    return this.client.healthCheck();
  }
}
