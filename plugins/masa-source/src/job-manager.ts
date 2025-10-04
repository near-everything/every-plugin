import { Effect, Schedule } from "every-plugin/effect";
import { MasaApiError, type MasaClient, type MasaSearchResult } from './client';
import type { MasaSearchMethod, MasaSourceType } from './schemas';

export class JobManager {
  constructor(private client: MasaClient) { }

  executeJobWorkflow<T>(
    sourceType: MasaSourceType,
    searchMethod: MasaSearchMethod,
    query: string,
    maxResults: number,
    processFn: (results: MasaSearchResult[]) => T,
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
          console.log(`[MASA] ${jobId} - Status check error:`, error);
          return error instanceof MasaApiError ? error : new MasaApiError(
            error instanceof Error ? error.message : 'Unknown error checking job status',
            503,
            `Check status for ${jobId}`
          );
        }
      });

      // Define permanent errors that should not be retried
      const isPermanentError = (error: MasaApiError): boolean =>
        error.status === 401 || error.status === 403 || error.status === 404;

      // Retry schedule: start at 3s, grow exponentially, max 30 attempts
      const retrySchedule = Schedule.exponential("3000 millis").pipe(
        Schedule.compose(Schedule.recurs(29))
      );

      // Wait for completion with idiomatic Effect retry logic
      yield* checkStatus.pipe(
        Effect.tap((status) =>
          Effect.sync(() => console.log(`[MASA] ${jobId} - Status: ${status}`))
        ),
        Effect.flatMap((status) => {
          if (status === 'done') {
            console.log(`[MASA] ${jobId} - Job completed successfully`);
            return Effect.succeed(undefined);
          }
          if (status === 'failed') {
            console.log(`[MASA] ${jobId} - Job failed permanently`);
            return Effect.fail(new MasaApiError(`Job failed: ${searchMethod} ${query}`, 503, `Job ${jobId}`));
          }
          // Status is "in progress" or other - continues to next retry
          return Effect.fail(new MasaApiError(`Job ${status}`, 503, `Job ${jobId}`));
        }),
        Effect.retry({
          schedule: retrySchedule,
          while: (error) => {
            if (error instanceof MasaApiError) {
              // Don't retry permanent errors
              if (isPermanentError(error)) {
                console.log(`[MASA] ${jobId} - Permanent error, not retrying: ${error.message}`);
                return false;
              }
              // Retry transient errors and "in progress" status
              console.log(`[MASA] ${jobId} - Transient error, retrying: ${error.message}`);
              return true;
            }
            console.log(`[MASA] ${jobId} - Unknown error, retrying:`, error);
            return true;
          }
        }),
        Effect.catchAll((error) =>
          Effect.fail(new MasaApiError(`Job timeout after retries: ${searchMethod} for ${query}`, 503, `Job ${jobId}`))
        )
      );

      // Get results
      const results = yield* Effect.tryPromise(() =>
        this.client.getJobResults(jobId)
      );

      return processFn(results);
    });
  }

  async getById(sourceType: MasaSourceType, id: string): Promise<MasaSearchResult> {
    return Effect.runPromise(
      this.executeJobWorkflow(
        sourceType,
        'getbyid',
        id,
        1,
        (results) => {
          if (results.length === 0) {
            throw new MasaApiError(`No results found for ID ${id}`, 404, `Get by ID ${id}`);
          }
          return results[0];
        }
      )
    );
  }

  async getBulk(sourceType: MasaSourceType, ids: string[]): Promise<MasaSearchResult[]> {
    const results: MasaSearchResult[] = [];

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
