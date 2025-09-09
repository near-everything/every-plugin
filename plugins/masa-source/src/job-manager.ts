import { MasaApiError, MasaClient, type MasaSearchResult } from './client';
import type { MasaSearchMethod, MasaSourceType } from './schemas';

export class JobManager {
  constructor(private client: MasaClient) { }

  async executeJobWorkflow<T>(
    sourceType: MasaSourceType,
    searchMethod: MasaSearchMethod,
    query: string,
    maxResults: number,
    processFn: (results: MasaSearchResult[]) => T,
    nextCursor?: string
  ): Promise<T> {
    const jobId = await this.client.submitSearchJob(sourceType, searchMethod, query, maxResults, nextCursor);

    // Poll for completion
    let status = 'submitted';
    let attempts = 0;
    const maxAttempts = 30;

    while (status !== 'done' && status !== 'error' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      status = await this.client.checkJobStatus(jobId);
      attempts++;
    }

    if (status === 'error') {
      throw new MasaApiError(`Job failed: ${searchMethod} for ${query}`, 503, `Job workflow ${jobId}`);
    }

    if (status !== 'done') {
      throw new MasaApiError(`Job timeout: ${searchMethod} for ${query}`, 503, `Job workflow ${jobId}`);
    }

    const results = await this.client.getJobResults(jobId);
    return processFn(results);
  }

  async getById(sourceType: MasaSourceType, id: string): Promise<MasaSearchResult> {
    return this.executeJobWorkflow(
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
