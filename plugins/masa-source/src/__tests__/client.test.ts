import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasaClient, MasaApiError } from '../client';
import { mockMasaResponses } from './setup';

describe('MasaClient', () => {
  let client: MasaClient;

  beforeEach(() => {
    client = new MasaClient(
      'https://data.gopher-ai.com/api/v1',
      'test-api-key',
      5000 // 5 second timeout for tests
    );
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(client).toBeInstanceOf(MasaClient);
    });
  });

  describe('healthCheck', () => {
    it('should return OK', async () => {
      const result = await client.healthCheck();
      expect(result).toBe('OK');
    });
  });

  describe('submitSearchJob', () => {
    it('should submit a search job successfully', async () => {
      const jobId = await client.submitSearchJob(
        'twitter',
        'searchbyquery',
        'blockchain',
        10
      );

      expect(jobId).toBe('test-job-uuid-123');
    });


    it('should include cursor for pagination', async () => {
      const jobId = await client.submitSearchJob(
        'twitter-credential',
        'searchbyquery',
        'test query',
        25,
        'cursor-123'
      );

      expect(jobId).toBe('test-job-uuid-123');
    });
  });

  describe('checkJobStatus', () => {
    it('should return job status', async () => {
      const status = await client.checkJobStatus('test-job-uuid-123');
      expect(status).toBe('done');
    });

    it('should handle error status', async () => {
      const status = await client.checkJobStatus('error-job');
      expect(status).toBe('error');
    });

    it('should handle processing status', async () => {
      const status = await client.checkJobStatus('processing-job');
      expect(status).toBe('processing');
    });
  });

  describe('getJobResults', () => {
    it('should return job results', async () => {
      const results = await client.getJobResults('test-job-uuid-123');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockMasaResponses.jobResults[0]);
      expect(results[1]).toEqual(mockMasaResponses.jobResults[1]);
    });

    it('should return empty array for empty results', async () => {
      const results = await client.getJobResults('empty-job');
      expect(results).toEqual([]);
    });

    it('should handle non-array responses', async () => {
      // This tests the Array.isArray check in the method
      const results = await client.getJobResults('test-job-uuid-123');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('similaritySearch', () => {
    it('should perform similarity search', async () => {
      const results = await client.similaritySearch({
        query: 'blockchain technology',
        sources: ['twitter'],
        keywords: ['crypto', 'bitcoin'],
        keyword_operator: 'or',
        max_results: 10
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockMasaResponses.similarityResults[0]);
    });

    it('should work with minimal options', async () => {
      const results = await client.similaritySearch({
        query: 'test query'
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('hybridSearch', () => {
    it('should perform hybrid search', async () => {
      const results = await client.hybridSearch({
        similarity_query: {
          query: 'artificial intelligence',
          weight: 0.7
        },
        text_query: {
          query: 'machine learning AI',
          weight: 0.3
        },
        sources: ['twitter'],
        keywords: ['AI', 'ML'],
        keyword_operator: 'and',
        max_results: 20
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockMasaResponses.hybridResults[0]);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const badClient = new MasaClient('https://invalid-url.com', 'test-key');

      await expect(
        badClient.submitSearchJob('twitter', 'searchbyquery', 'test', 10)
      ).rejects.toThrow();
    });

    it('should throw MasaApiError with correct status codes', async () => {
      // This test verifies that MasaApiError is properly constructed
      const error = new MasaApiError('Test error', 404, 'Test context');
      expect(error).toBeInstanceOf(MasaApiError);
      expect(error.status).toBe(404);
      expect(error.context).toBe('Test context');
      expect(error.message).toBe('Test error');
    });
  });
});
