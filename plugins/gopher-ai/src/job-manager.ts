import { Effect, Schedule } from "every-plugin/effect";
import { ApiError, type GopherAIClient, type SearchResult } from './client';
import type { SearchMethod, SourceType } from './schemas';

export class JobManager {
  constructor(private client: GopherAIClient) { }

  executeJobWorkflow<T>(
    sourceType: SourceType,
    searchMethod: SearchMethod,
    query: string,
    maxResults: number,
    processFn: (results: SearchResult[]) => T,
    nextCursor?: string
  ) {
    return Effect.gen(this, function* () {
      // Submit job
      const jobId = yield* Effect.tryPromise(() =>
        this.client.submitSearchJob(sourceType, searchMethod, query, maxResults, nextCursor)
      );

      // Poll with exponential backoff
      const checkStatus = Effect.tryPromise({
        try: () => this.client.checkJobStatus(jobId),
        catch: (error) => {
          console.log(`[GOPHERAI] ${jobId} - Status check error:`, error);
          return error instanceof ApiError ? error : new ApiError(
            error instanceof Error ? error.message : 'Unknown error checking job status',
            503,
            `Check status for ${jobId}`
          );
        }
      });

      // Define permanent errors that should not be retried
      const isPermanentError = (error: ApiError): boolean =>
        error.status === 401 || error.status === 403 || error.status === 404;

      // Retry schedule: start at 3s, grow exponentially, max 30 attempts
      const retrySchedule = Schedule.exponential("3000 millis").pipe(
        Schedule.compose(Schedule.recurs(29))
      );

      // Wait for completion with idiomatic Effect retry logic
      yield* checkStatus.pipe(
        Effect.tap((status) =>
          Effect.sync(() => console.log(`[GOPHERAI] ${jobId} - Status: ${status}`))
        ),
        Effect.flatMap((status) => {
          if (status === 'done') {
            console.log(`[GOPHERAI] ${jobId} - Job completed successfully`);
            return Effect.succeed(undefined);
          }
          if (status === 'failed') {
            console.log(`[GOPHERAI] ${jobId} - Job failed permanently`);
            return Effect.fail(new ApiError(`Job failed: ${searchMethod} ${query}`, 503, `Job ${jobId}`));
          }
          // Status is "in progress" or other - continues to next retry
          return Effect.fail(new ApiError(`Job ${status}`, 503, `Job ${jobId}`));
        }),
        Effect.retry({
          schedule: retrySchedule,
          while: (error) => {
            if (error instanceof ApiError) {
              // Don't retry permanent errors
              if (isPermanentError(error)) {
                console.log(`[GOPHERAI] ${jobId} - Permanent error, not retrying: ${error.message}`);
                return false;
              }
              // Retry transient errors and "in progress" status
              console.log(`[GOPHERAI] ${jobId} - Transient error, retrying: ${error.message}`);
              return true;
            }
            console.log(`[GOPHERAI] ${jobId} - Unknown error, retrying:`, error);
            return true;
          }
        }),
        Effect.catchAll(() =>
          Effect.fail(new ApiError(`Job timeout after retries: ${searchMethod} for ${query}`, 503, `Job ${jobId}`))
        )
      );

      // Get results
      const results = yield* Effect.tryPromise(() =>
        this.client.getJobResults(jobId)
      );

      return processFn(results);
    });
  }

  async getById(sourceType: SourceType, id: string): Promise<SearchResult> {
    return Effect.runPromise(
      this.executeJobWorkflow(
        sourceType,
        'getbyid',
        id,
        1,
        (results) => {
          if (results.length === 0) {
            throw new ApiError(`No results found for ID ${id}`, 404, `Get by ID ${id}`);
          }
          return results[0];
        }
      )
    );
  }

  async getBulk(sourceType: SourceType, ids: string[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const id of ids) {
      try {
        const result = await this.getById(sourceType, id);
        results.push(result);
      } catch (error) {
        console.warn(`Failed to fetch ID ${id}:`, error);
      }
    }

    return results;
  }
}
