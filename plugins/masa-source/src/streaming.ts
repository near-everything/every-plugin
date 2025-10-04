import { Effect } from "every-plugin/effect";
import type { JobManager } from "./job-manager";
import type { MasaSourceType, MasaSearchMethod, SourceItem } from "./schemas";
import { buildBackfillQuery, buildLiveQuery, convertMasaResultToSourceItem } from "./utils";

export async function fetchAndConvert(
  jobManager: JobManager,
  sourceType: MasaSourceType,
  searchMethod: MasaSearchMethod,
  query: string,
  pageSize: number
): Promise<SourceItem[]> {
  const results = await Effect.runPromise(
    jobManager.executeJobWorkflow(
      sourceType,
      searchMethod,
      query,
      pageSize,
      (results) => results
    )
  );

  return results
    .map(convertMasaResultToSourceItem)
    .sort((a, b) =>
      new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
    );
}

export async function* backfillStream(
  jobManager: JobManager,
  baseQuery: string,
  sourceType: MasaSourceType,
  searchMethod: MasaSearchMethod,
  maxId: string | undefined,
  maxResults: number | undefined,
  oldestAllowedId: string | undefined,
  maxBackfillAgeMs: number | undefined,
  pageSize: number
): AsyncGenerator<SourceItem> {
  let oldestSeenId = maxId;
  let totalYielded = 0;
  const cutoffTime = maxBackfillAgeMs
    ? Date.now() - maxBackfillAgeMs
    : undefined;

  while (true) {
    if (maxResults && totalYielded >= maxResults) break;

    const query = buildBackfillQuery(baseQuery, oldestSeenId);
    const items = await fetchAndConvert(jobManager, sourceType, searchMethod, query, pageSize);

    if (items.length === 0) break;

    for (const item of items) {
      if (maxResults && totalYielded >= maxResults) break;

      // Age filter
      if (cutoffTime && new Date(item.createdAt!).getTime() < cutoffTime) break;

      // ID filter
      if (oldestAllowedId && BigInt(item.externalId) < BigInt(oldestAllowedId)) break;

      yield item;
      totalYielded++;

      const itemId = BigInt(item.externalId);
      if (!oldestSeenId || itemId < BigInt(oldestSeenId)) {
        oldestSeenId = item.externalId;
      }
    }

    if (items.length < pageSize) break;
  }
}

export async function* liveStream(
  jobManager: JobManager,
  baseQuery: string,
  sourceType: MasaSourceType,
  searchMethod: MasaSearchMethod,
  sinceId: string | undefined,
  maxResults: number | undefined,
  pageSize: number,
  pollMs: number
): AsyncGenerator<SourceItem> {
  let mostRecentId = sinceId;
  let totalYielded = 0;

  while (true) {
    if (maxResults && totalYielded >= maxResults) break;

    const query = buildLiveQuery(baseQuery, mostRecentId);
    const items = await fetchAndConvert(jobManager, sourceType, searchMethod, query, pageSize);

    for (const item of items) {
      if (maxResults && totalYielded >= maxResults) break;

      yield item;
      totalYielded++;

      const itemId = BigInt(item.externalId);
      if (!mostRecentId || itemId > BigInt(mostRecentId)) {
        mostRecentId = item.externalId;
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

export async function* gapDetectionAndLiveStream(
  jobManager: JobManager,
  baseQuery: string,
  sourceType: MasaSourceType,
  searchMethod: MasaSearchMethod,
  mostRecentId: string | undefined,
  livePageSize: number,
  livePollMs: number
): AsyncGenerator<SourceItem> {
  // Phase 1: Gap detection
  if (mostRecentId) {
    const gapProbe = await fetchAndConvert(
      jobManager,
      sourceType,
      searchMethod,
      buildLiveQuery(baseQuery, mostRecentId),
      1
    );

    if (gapProbe.length > 0) {
      // Gap exists, backfill from newest backwards until reaching mostRecentId
      let gapMaxId: string | undefined;
      let reachedContinuity = false;

      while (!reachedContinuity) {
        const gapItems = await fetchAndConvert(
          jobManager,
          sourceType,
          searchMethod,
          buildBackfillQuery(baseQuery, gapMaxId),
          livePageSize
        );

        if (gapItems.length === 0) break;

        for (const item of gapItems) {
          // Check if we've reached continuity with mostRecentId
          if (BigInt(item.externalId) <= BigInt(mostRecentId)) {
            reachedContinuity = true;
            break;
          }

          yield item;
          gapMaxId = item.externalId;
        }

        // Safety check: if last batch didn't yield anything newer than mostRecentId
        if (gapMaxId && BigInt(gapMaxId) <= BigInt(mostRecentId)) {
          break;
        }
      }
    }
  }

  // Phase 2: Enter live mode
  yield* liveStream(jobManager, baseQuery, sourceType, searchMethod, mostRecentId, undefined, livePageSize, livePollMs);
}
