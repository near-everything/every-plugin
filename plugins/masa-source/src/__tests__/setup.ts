import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import "dotenv/config";

// Mock Masa API responses
const mockMasaResponses = {
  submitJob: { uuid: 'test-job-uuid-123', error: '' },
  jobStatus: { status: 'done' },
  jobResults: [
    {
      id: 'tweet-123',
      source: 'twitter',
      content: 'This is a test tweet about blockchain technology',
      metadata: {
        created_at: '2024-01-15T10:30:00Z',
        username: 'testuser',
        user_id: 'user-456',
        author: 'Test User',
        tweet_id: 1234567890123456,
        likes: 5,
        public_metrics: {
          like_count: 5,
          retweet_count: 2,
          reply_count: 1,
          quote_count: 0
        }
      },
      updated_at: '2024-01-15T10:30:00Z'
    },
    {
      id: 'tweet-456',
      source: 'twitter',
      content: 'Another test tweet about AI and machine learning',
      metadata: {
        created_at: '2024-01-15T11:00:00Z',
        username: 'aiexpert',
        user_id: 'user-789',
        author: 'AI Expert',
        tweet_id: 1234567890123457,
        likes: 3,
        public_metrics: {
          like_count: 3,
          retweet_count: 1,
          reply_count: 0,
          quote_count: 1
        }
      },
      updated_at: '2024-01-15T11:00:00Z'
    }
  ],
  similarityResults: [
    {
      id: 'similar-123',
      source: 'twitter',
      content: 'Semantic search result about blockchain',
      metadata: {
        created_at: '2024-01-15T09:00:00Z',
        username: 'cryptouser',
        user_id: 'user-crypto',
        author: 'Crypto User',
        tweet_id: 1234567890123458,
        likes: 10
      },
      updated_at: '2024-01-15T09:00:00Z'
    }
  ],
  hybridResults: [
    {
      id: 'hybrid-123',
      source: 'twitter',
      content: 'Hybrid search result combining semantic and keyword matching',
      metadata: {
        created_at: '2024-01-15T08:30:00Z',
        username: 'techwriter',
        user_id: 'user-tech',
        author: 'Tech Writer',
        tweet_id: 1234567890123459,
        likes: 7
      },
      updated_at: '2024-01-15T08:30:00Z'
    }
  ],
  trends: [
    {
      id: 'trend-1',
      source: 'twitter',
      content: '#AI',
      metadata: {
        username: 'trending',
        likes: 50000
      },
      updated_at: '2024-01-15T12:00:00Z'
    },
    {
      id: 'trend-2',
      source: 'twitter',
      content: '#Blockchain',
      metadata: {
        username: 'trending',
        likes: 25000
      },
      updated_at: '2024-01-15T12:00:00Z'
    }
  ]
};

// MSW server setup
export const server = setupServer(
  // Submit search job
  http.post('https://data.masa.ai/api/v1/search/live', async ({ request }) => {
    try {
      await request.json();
      return HttpResponse.json(mockMasaResponses.submitJob);
    } catch {
      return HttpResponse.json(mockMasaResponses.submitJob);
    }
  }),

  // Check job status
  http.get('https://data.masa.ai/api/v1/search/live/status/:jobId', ({ params }) => {
    const { jobId } = params;

    if (jobId === 'error-job') {
      return HttpResponse.json({ status: 'error' });
    }

    if (jobId === 'processing-job') {
      return HttpResponse.json({ status: 'processing' });
    }

    return HttpResponse.json(mockMasaResponses.jobStatus);
  }),

  // Get job results
  http.get('https://data.masa.ai/api/v1/search/live/result/:jobId', ({ params }) => {
    const { jobId } = params;

    if (jobId === 'empty-job') {
      return HttpResponse.json([]);
    }

    if (jobId === 'trends-job') {
      return HttpResponse.json(mockMasaResponses.trends);
    }

    return HttpResponse.json(mockMasaResponses.jobResults);
  }),

  // Similarity search
  http.post('https://data.masa.ai/api/v1/search/similarity', async ({ request }) => {
    try {
      const body = await request.json() as any;

      if (body.query === 'no-results') {
        return HttpResponse.json([]);
      }

      return HttpResponse.json(mockMasaResponses.similarityResults);
    } catch {
      console.log('MSW: Failed to parse similarity search request body as JSON, returning default response');
      return HttpResponse.json(mockMasaResponses.similarityResults);
    }
  }),

  // Hybrid search
  http.post('https://data.masa.ai/api/v1/search/hybrid', async ({ request }) => {
    try {
      const body = await request.json() as any;

      if (body.similarity_query?.query === 'no-results') {
        return HttpResponse.json([]);
      }

      return HttpResponse.json(mockMasaResponses.hybridResults);
    } catch {
      console.log('MSW: Failed to parse hybrid search request body as JSON, returning default response');
      return HttpResponse.json(mockMasaResponses.hybridResults);
    }
  })
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Export mock data for use in tests
export { mockMasaResponses };
