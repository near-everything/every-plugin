import { createRouterClient, type RouterClient } from '@orpc/server';
import type { AppRouter } from '../routers';

declare global {
  var $apiClient: RouterClient<AppRouter> | undefined;
}

export function initializeServerApiClient(router: AppRouter) {
  globalThis.$apiClient = createRouterClient(router, {
    context: async () => ({
      session: null,
      user: null,
      nearAccountId: null,
    }),
  });
}

export function getServerApiClient() {
  if (!globalThis.$apiClient) {
    throw new Error('Server API client not initialized. Call initializeServerApiClient first.');
  }
  return globalThis.$apiClient;
}

export function hasServerApiClient(): boolean {
  return !!globalThis.$apiClient;
}
