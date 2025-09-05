import { createFetch } from '@better-fetch/fetch';
import { z } from 'zod';
import type { MasaSearchMethod, MasaSourceType } from './schemas';

// Response schemas for better-fetch validation
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
}).passthrough(); // Allow additional fields

export interface MasaJobResponse {
  uuid: string;
  error?: string;
}

export interface MasaJobStatusResponse {
  status: string;
  error?: string;
}

export interface MasaSimilaritySearchOptions {
  query: string;
  sources?: string[];
  keywords?: string[];
  keyword_operator?: 'and' | 'or';
  max_results?: number;
}

export interface MasaHybridSearchOptions {
  similarity_query: {
    query: string;
    weight: number;
  };
  text_query: {
    query: string;
    weight: number;
  };
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
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private $fetch: ReturnType<typeof createFetch>;

  constructor(baseUrl: string, apiKey: string, timeout = 30000) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeout = timeout;

    if (!this.apiKey) {
      console.warn("Masa API key was not provided to MasaClient. API calls will fail.");
    }

    // Create better-fetch instance with retry logic
    this.$fetch = createFetch({
      baseURL: this.baseUrl,
      retry: {
        type: "exponential",
        attempts: 3,
        baseDelay: 1000,
        maxDelay: 10000
      },
      timeout: this.timeout > 0 ? this.timeout : 30000 // Ensure valid timeout
    });
  }

  async healthCheck(): Promise<string> {
    return "OK";
  }

  // Async job methods for live/historical search
  async submitSearchJob(
    sourceType: MasaSourceType,
    searchMethod: MasaSearchMethod,
    query: string,
    maxResults: number,
    nextCursor?: string
  ): Promise<string> {
    console.log(`[MASA CLIENT] Submitting search job: ${searchMethod} for "${query}"`);

    const payload = {
      type: sourceType,
      arguments: {
        type: searchMethod,
        query,
        max_results: maxResults,
      },
    };

    // Add cursor for pagination if provided
    if (nextCursor) {
      payload.arguments.next_cursor = nextCursor;
    }

    try {
      const { data, error } = await this.$fetch('/search/live/twitter', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        output: MasaJobResponseSchema,
      });

      if (error) {
        console.log(`[MASA CLIENT] API request failed:`, error);
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        throw new Error(`Masa API error: ${errorMessage}`);
      }

      if (data.error) {
        console.log(`[MASA CLIENT] Masa API returned error:`, data.error);
        throw new Error(`Masa API error: 400`);
      }

      if (!data.uuid) {
        console.log(`[MASA CLIENT] No UUID in response:`, data);
        throw new Error('Masa API did not return a UUID for the submitted job.');
      }

      console.log(`[MASA CLIENT] Job submitted successfully: ${data.uuid}`);
      return data.uuid;
    } catch (fetchError) {
      console.log(`[MASA CLIENT] Fetch error:`, fetchError);
      // Handle HTTP errors (like 400, 500, etc.)
      if (fetchError instanceof Error && fetchError.message.includes('400')) {
        throw new Error('Masa API error: 400');
      }
      throw fetchError;
    }
  }

  async checkJobStatus(jobId: string): Promise<string> {
    console.log(`[MASA CLIENT] Checking job status: ${jobId}`);

    const { data, error } = await this.$fetch(`/search/live/twitter/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      output: MasaJobStatusResponseSchema,
    });

    if (error) {
      console.log(`[MASA CLIENT] Status check failed:`, error);
      const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
      throw new Error(`Network/API Error: ${errorMessage}`);
    }

    if (data.error) {
      console.log(`[MASA CLIENT] Masa API status error:`, data.error);
      throw new Error(`Masa API Error: ${data.error}`);
    }

    if (!data.status) {
      console.log(`[MASA CLIENT] No status in response:`, data);
      throw new Error('Masa API did not return a status for the job.');
    }

    console.log(`[MASA CLIENT] Job status: ${data.status}`);
    return data.status;
  }

  async getJobResults(jobId: string): Promise<MasaSearchResult[]> {
    console.log(`[MASA CLIENT] Getting job results: ${jobId}`);

    const { data, error } = await this.$fetch(`/search/live/twitter/result/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      output: z.array(MasaSearchResultSchema),
    });

    if (error) {
      console.log(`[MASA CLIENT] Results fetch failed:`, error);
      const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
      throw new Error(`Network/API Error: ${errorMessage}`);
    }

    const results = Array.isArray(data) ? data : [];
    console.log(`[MASA CLIENT] Retrieved ${results.length} results`);
    return results;
  }

  // Instant search methods
  async similaritySearch(options: MasaSimilaritySearchOptions): Promise<MasaSearchResult[]> {
    const url = `${this.baseUrl}/search/similarity`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Masa similarity search error: ${response.status} ${errorText}`);
    }

    const results: MasaSearchResult[] = await response.json();
    return Array.isArray(results) ? results : [];
  }

  async hybridSearch(options: MasaHybridSearchOptions): Promise<MasaSearchResult[]> {
    const url = `${this.baseUrl}/search/hybrid`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Masa hybrid search error: ${response.status} ${errorText}`);
    }

    const results: MasaSearchResult[] = await response.json();
    return Array.isArray(results) ? results : [];
  }

  // Single item fetch by ID
  async getById(sourceType: MasaSourceType, id: string): Promise<MasaSearchResult> {
    // Use the getbyid search method
    const jobId = await this.submitSearchJob(sourceType, 'getbyid', id, 1);

    // Poll for completion
    let status = 'submitted';
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    while (status !== 'done' && status !== 'error' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      status = await this.checkJobStatus(jobId);
      attempts++;
    }

    if (status === 'error') {
      throw new Error(`Job failed for ID ${id}`);
    }

    if (status !== 'done') {
      throw new Error(`Job timeout for ID ${id}`);
    }

    const results = await this.getJobResults(jobId);

    if (results.length === 0) {
      throw new Error(`No results found for ID ${id}`);
    }

    return results[0];
  }

  // Bulk fetch by IDs
  async getBulk(sourceType: MasaSourceType, ids: string[]): Promise<MasaSearchResult[]> {
    // For bulk operations, we'll need to make individual requests
    // In a real implementation, you might batch these or use a different endpoint
    const results: MasaSearchResult[] = [];

    for (const id of ids) {
      try {
        const result = await this.getById(sourceType, id);
        results.push(result);
      } catch (error) {
        console.warn(`Failed to fetch ID ${id}:`, error);
        // Continue with other IDs
      }
    }

    return results;
  }
}
