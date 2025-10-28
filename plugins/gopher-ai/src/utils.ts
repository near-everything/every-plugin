
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

