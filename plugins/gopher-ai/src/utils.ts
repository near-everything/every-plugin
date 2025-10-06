import { ApiError } from "./client";

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
