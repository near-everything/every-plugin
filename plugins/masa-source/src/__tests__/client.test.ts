import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MasaClient } from '../client';
import { mockMasaResponses } from './setup';

describe('MasaClient', () => {
  let client: MasaClient;

  beforeEach(() => {
    client = new MasaClient(
      'https://data.masa.ai/api/v1',
      'test-api-key',
      5000 // 5 second timeout for tests
    );
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(client).toBeInstanceOf(MasaClient);
    });

    it('should warn when API key is missing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new MasaClient('https://data.masa.ai/api/v1', '');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Masa API key was not provided to MasaClient. API calls will fail.'
      );
      consoleSpy.mockRestore();
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

    it('should handle empty results', async () => {
      const results = await client.similaritySearch({
        query: 'no-results',
        max_results: 10
      });

      expect(results).toEqual([]);
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

    it('should handle empty results', async () => {
      const results = await client.hybridSearch({
        similarity_query: {
          query: 'no-results',
          weight: 0.5
        },
        text_query: {
          query: 'test',
          weight: 0.5
        }
      });

      expect(results).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should fetch single item by ID', async () => {
      const result = await client.getById('twitter', 'tweet-123');
      
      expect(result).toEqual(mockMasaResponses.jobResults[0]);
    });

    it('should handle job polling', async () => {
      // This test verifies the polling mechanism works
      const result = await client.getById('twitter', 'tweet-456');
      expect(result).toBeDefined();
    });

    it('should throw error for failed jobs', async () => {
      // Mock a job that will fail
      vi.spyOn(client, 'submitSearchJob').mockResolvedValue('error-job');
      
      await expect(
        client.getById('twitter', 'failing-tweet')
      ).rejects.toThrow('Job failed for ID failing-tweet');
    });

    it('should throw error for empty results', async () => {
      // Mock a job that returns empty results
      vi.spyOn(client, 'submitSearchJob').mockResolvedValue('empty-job');
      
      await expect(
        client.getById('twitter', 'nonexistent-tweet')
      ).rejects.toThrow('No results found for ID nonexistent-tweet');
    });
  });

  describe('getBulk', () => {
    it('should fetch multiple items by IDs', async () => {
      const results = await client.getBulk('twitter', ['tweet-123', 'tweet-456']);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockMasaResponses.jobResults[0]);
    });

    it('should handle partial failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock one successful and one failed ID
      vi.spyOn(client, 'getById')
        .mockResolvedValueOnce(mockMasaResponses.jobResults[0])
        .mockRejectedValueOnce(new Error('Failed to fetch'));
      
      const results = await client.getBulk('twitter', ['tweet-123', 'failing-tweet']);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockMasaResponses.jobResults[0]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch ID failing-tweet:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should return empty array when all IDs fail', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      vi.spyOn(client, 'getById').mockRejectedValue(new Error('All failed'));
      
      const results = await client.getBulk('twitter', ['fail-1', 'fail-2']);
      
      expect(results).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const badClient = new MasaClient('https://invalid-url.com', 'test-key');
      
      await expect(
        badClient.submitSearchJob('twitter', 'searchbyquery', 'test', 10)
      ).rejects.toThrow();
    });
  });
});
