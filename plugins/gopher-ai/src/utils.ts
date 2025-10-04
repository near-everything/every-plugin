import type { SearchResult } from "./client";
import { ApiError } from "./client";
import type { SourceItem } from "./schemas";

export function decrementSnowflakeId(id: string): string {
  try {
    const snowflake = BigInt(id);
    return snowflake <= 0n ? id : (snowflake - 1n).toString();
  } catch {
    return id;
  }
}

export function buildBackfillQuery(baseQuery: string, maxId?: string): string {
  if (!maxId) return baseQuery;
  const decrementedId = decrementSnowflakeId(maxId);
  return `${baseQuery} max_id:${decrementedId}`;
}

export function buildLiveQuery(baseQuery: string, sinceId?: string): string {
  if (!sinceId) return baseQuery;
  return `${baseQuery} since_id:${sinceId}`;
}

export function handleError(error: unknown, errors: any): never {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        throw errors.UNAUTHORIZED({
          message: 'Invalid API key',
          data: { provider: 'gopherai', apiKeyProvided: true }
        });
      case 403:
        throw errors.FORBIDDEN({
          message: 'Access forbidden',
          data: { provider: 'gopherai' }
        });
      case 400:
        throw errors.BAD_REQUEST({
          message: 'Invalid request parameters',
          data: { provider: 'gopherai' }
        });
      case 404:
        throw errors.NOT_FOUND({
          message: 'Resource not found',
          data: { provider: 'gopherai' }
        });
      default:
        throw errors.SERVICE_UNAVAILABLE({
          message: 'Service temporarily unavailable',
          data: { provider: 'gopherai' }
        });
    }
  }

  throw errors.SERVICE_UNAVAILABLE({
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    data: { provider: 'gopherai' }
  });
}

export function convertResultToSourceItem(result: SearchResult): SourceItem {
  const snowflakeToTimestamp = (id: string): string => {
    const TWITTER_EPOCH = 1288834974657n;
    const snowflake = BigInt(id);
    const timestamp = Number((snowflake >> 22n) + TWITTER_EPOCH);
    return new Date(timestamp).toISOString();
  };

  const isValidTimestamp = (timestamp: string | undefined): boolean => {
    if (!timestamp) return false;
    if (timestamp === "0001-01-01T00:00:00Z") return false;

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return false;

    const twitterEpochDate = new Date("2010-11-04T00:00:00Z");
    return date >= twitterEpochDate;
  };

  const createdAt = isValidTimestamp(result.metadata?.created_at)
    ? result.metadata!.created_at
    : snowflakeToTimestamp(result.id);

  return {
    externalId: result.id,
    content: result.content,
    contentType: "post",
    createdAt,
    url: result.metadata?.tweet_id ? `https://twitter.com/i/status/${result.metadata.tweet_id}` : undefined,
    authors: result.metadata?.username ? [{
      id: result.metadata?.user_id,
      username: result.metadata?.username,
      displayName: result.metadata?.author || result.metadata?.username,
    }] : undefined,
    raw: result,
  };
}
