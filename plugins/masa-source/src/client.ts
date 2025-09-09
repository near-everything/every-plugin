import { BetterFetchOption, createFetch } from '@better-fetch/fetch';
import { z } from 'zod';
import type { MasaSearchMethod, MasaSourceType } from './schemas';

export class MasaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly context?: string
  ) {
    super(message);
    this.name = 'MasaApiError';
  }
}

// Response schemas
const MasaJobResponseSchema = z.object({
  uuid: z.string().optional(),
  error: z.string().optional()
});

const MasaJobStatusResponseSchema = z.object({
  status: z.string(),
  error: z.string().optional()
});

const MasaSearchResultSchema = z.object({
  id: z.string(),
  source: z.string(),
  content: z.string(),
  metadata: z.object({
    author: z.string().optional(),
    conversation_id: z.string().optional(),
    created_at: z.string().optional(),
    lang: z.string().optional(),
    likes: z.number().optional(),
    newest_id: z.string().optional(),
    oldest_id: z.string().optional(),
    possibly_sensitive: z.boolean().optional(),
    public_metrics: z.object({
      bookmark_count: z.number().optional(),
      impression_count: z.number().optional(),
      like_count: z.number().optional(),
      quote_count: z.number().optional(),
      reply_count: z.number().optional(),
      retweet_count: z.number().optional(),
    }).optional(),
    tweet_id: z.number().optional(),
    user_id: z.string().optional(),
    username: z.string().optional(),
  }).optional(),
  updated_at: z.string().optional(),
}).passthrough();

// Types
export interface MasaSimilaritySearchOptions {
  query: string;
  sources?: string[];
  keywords?: string[];
  keyword_operator?: 'and' | 'or';
  max_results?: number;
}

export interface MasaHybridSearchOptions {
  similarity_query: { query: string; weight: number };
  text_query: { query: string; weight: number };
  sources?: string[];
  keywords?: string[];
  keyword_operator?: 'and' | 'or';
  max_results?: number;
}

export interface MasaSearchResult {
  id: string;
  source: string;
  content: string;
  metadata?: {
    author?: string;
    conversation_id?: string;
    created_at?: string;
    lang?: string;
    likes?: number;
    newest_id?: string;
    oldest_id?: string;
    possibly_sensitive?: boolean;
    public_metrics?: {
      bookmark_count?: number;
      impression_count?: number;
      like_count?: number;
      quote_count?: number;
      reply_count?: number;
      retweet_count?: number;
    };
    tweet_id?: number;
    user_id?: string;
    username?: string;
  };
  updated_at?: string;
  [key: string]: unknown;
}

export class MasaClient {
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
      throw new MasaApiError(
        error.message || error.statusText || 'Unknown API error',
        error.status,
        options.context
      );
    }

    return data as T;
  }

  async healthCheck(): Promise<string> {
    return "OK";
  }

  async submitSearchJob(
    sourceType: MasaSourceType,
    searchMethod: MasaSearchMethod,
    query: string,
    maxResults: number,
    nextCursor?: string
  ): Promise<string> {
    const data = await this.request('/search/live', {
      method: 'POST',
      body: {
        type: sourceType,
        arguments: { type: searchMethod, query, max_results: maxResults, ...(nextCursor && { next_cursor: nextCursor }) }
      },
      schema: MasaJobResponseSchema,
      context: 'Submit search job'
    });

    if (data.error) {
      throw new MasaApiError(`Invalid request: ${data.error}`, 400, 'Submit search job');
    }

    if (!data.uuid) {
      throw new MasaApiError('API did not return a job UUID', 503, 'Submit search job');
    }

    return data.uuid;
  }

  async checkJobStatus(jobId: string): Promise<string> {
    const data = await this.request(`/search/live/status/${jobId}`, {
      method: 'GET',
      schema: MasaJobStatusResponseSchema,
      context: `Check job status for ${jobId}`
    });

    if (data.error) {
      throw new MasaApiError(`API error: ${data.error}`, 503, `Check job status for ${jobId}`);
    }

    if (!data.status) {
      throw new MasaApiError('API did not return job status', 503, `Check job status for ${jobId}`);
    }

    // Normalize API status values to contract-expected values
    let normalizedStatus = data.status;
    if (data.status === 'done(saved)') {
      normalizedStatus = 'done';
    }

    return normalizedStatus;
  }

  async getJobResults(jobId: string): Promise<MasaSearchResult[]> {
    const data = await this.request(`/search/live/result/${jobId}`, {
      method: 'GET',
      schema: z.array(MasaSearchResultSchema),
      context: `Get job results for ${jobId}`
    });

    return Array.isArray(data) ? data : [];
  }

  async similaritySearch(options: MasaSimilaritySearchOptions): Promise<MasaSearchResult[]> {
    const results = await this.request('/search/similarity', {
      method: 'POST',
      body: options,
      schema: z.array(MasaSearchResultSchema),
      context: 'Similarity search'
    });

    return Array.isArray(results) ? results : [];
  }

  async hybridSearch(options: MasaHybridSearchOptions): Promise<MasaSearchResult[]> {
    const results = await this.request('/search/hybrid', {
      method: 'POST',
      body: options,
      schema: z.array(MasaSearchResultSchema),
      context: 'Hybrid search'
    });

    return Array.isArray(results) ? results : [];
  }

}
