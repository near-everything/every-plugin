import { type BetterFetchOption, createFetch } from '@better-fetch/fetch';
import { Effect } from 'every-plugin/effect';
import { z } from 'every-plugin/zod';
import { GopherResultSchema, type SearchMethod, type SourceType } from './contract';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly context?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Response schemas
const JobResponseSchema = z.object({
  uuid: z.string().optional(),
  error: z.string().optional()
});

const JobStatusResponseSchema = z.object({
  status: z.string(),
  error: z.string().optional()
});

// Types
export interface SimilaritySearchOptions {
  query: string;
  sources?: string[];
  keywords?: string[];
  keyword_operator?: 'and' | 'or';
  max_results?: number;
}

export interface HybridSearchOptions {
  similarity_query: { query: string; weight: number };
  text_query: { query: string; weight: number };
  sources?: string[];
  keywords?: string[];
  keyword_operator?: 'and' | 'or';
  max_results?: number;
}

export class GopherAIClient {
  private $fetch: ReturnType<typeof createFetch>;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private timeout = 30000
  ) {
    this.$fetch = createFetch({
      baseURL: this.baseUrl,
      retry: { type: "exponential", attempts: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: this.timeout > 0 ? this.timeout : 30000,
      plugins: [
      ],
    });
  }

  // Generic request method - handles all common logic
  private async request<T>(endpoint: string, options: {
    method: 'GET' | 'POST';
    body?: unknown;
    schema: z.ZodSchema<T>;
    context?: string;
  }): Promise<T> {
    const requestOptions: BetterFetchOption = {
      method: options.method,
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      output: options.schema,
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const { data, error } = await this.$fetch(endpoint, requestOptions);

    if (error) {
      throw new ApiError(
        error.message || error.statusText || 'Unknown API error',
        error.status,
        options.context,
        error
      );
    }

    return data as T;
  }

  healthCheck() {
    return Effect.succeed("OK");
  }

  submitSearchJob(
    sourceType: SourceType,
    searchMethod: SearchMethod,
    query: string,
    maxResults: number,
    nextCursor?: string
  ) {
    return Effect.tryPromise({
      try: async () => {
        const data = await this.request('/search/live', {
          method: 'POST',
          body: {
            type: sourceType,
            arguments: { type: searchMethod, query, max_results: maxResults, ...(nextCursor && { next_cursor: nextCursor }) }
          },
          schema: JobResponseSchema,
          context: 'Submit search job'
        });

        if (data.error) {
          throw new ApiError(`Invalid request: ${data.error}`, 400, 'Submit search job');
        }

        if (!data.uuid) {
          throw new ApiError('API did not return a job UUID', 503, 'Submit search job');
        }

        return data.uuid;
      },
      catch: (error: unknown) => {
        if (error instanceof ApiError) throw error;
        return new Error(`Submit job failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  checkJobStatus(jobId: string) {
    return Effect.tryPromise({
      try: async () => {
        try {
          const data = await this.request(`/search/live/status/${jobId}`, {
            method: 'GET',
            schema: JobStatusResponseSchema,
            context: `Check job status for ${jobId}`
          });

          if (data.error) {
            throw new ApiError(`API error: ${data.error}`, 503, `Check job status for ${jobId}`);
          }

          if (!data.status) {
            throw new ApiError('API did not return job status', 503, `Check job status for ${jobId}`);
          }

          let normalizedStatus = data.status;
          if (data.status === 'done(saved)') {
            normalizedStatus = 'done';
          }

          return normalizedStatus;
        } catch (error) {
          // "No new results" - job completed successfully with empty results
          if (error instanceof ApiError &&
              error.status === 500 &&
              error.details?.details?.error?.toLowerCase().includes('no new results')) {
            return 'empty';
          }
          throw error;
        }
      },
      catch: (error: unknown) => {
        if (error instanceof ApiError) throw error;
        return new Error(`Check status failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  getJobResults(jobId: string) {
    return Effect.tryPromise({
      try: async () => {
        const data = await this.request(`/search/live/result/${jobId}`, {
          method: 'GET',
          schema: z.array(GopherResultSchema),
          context: `Get job results for ${jobId}`
        });

        return Array.isArray(data) ? data : [];
      },
      catch: (error: unknown) => {
        if (error instanceof ApiError) throw error;
        return new Error(`Get results failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  similaritySearch(options: SimilaritySearchOptions) {
    return Effect.tryPromise({
      try: async () => {
        const results = await this.request('/search/similarity', {
          method: 'POST',
          body: options,
          schema: z.array(GopherResultSchema),
          context: 'Similarity search'
        });

        return Array.isArray(results) ? results : [];
      },
      catch: (error: unknown) => {
        if (error instanceof ApiError) throw error;
        return new Error(`Similarity search failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  hybridSearch(options: HybridSearchOptions) {
    return Effect.tryPromise({
      try: async () => {
        const results = await this.request('/search/hybrid', {
          method: 'POST',
          body: options,
          schema: z.array(GopherResultSchema),
          context: 'Hybrid search'
        });

        return Array.isArray(results) ? results : [];
      },
      catch: (error: unknown) => {
        if (error instanceof ApiError) throw error;
        return new Error(`Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

}
