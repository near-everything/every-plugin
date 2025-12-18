import { createORPCClient, onError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { contract } from '../../../api/src/contract';

export const API_URL = `${window.location.origin}/api/rpc`;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: () => { },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error && typeof error === 'object' && 'message' in error) {
          const message = String(error.message).toLowerCase();
          if (message.includes('fetch') || message.includes('network')) {
            return false;
          }
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function createApiLink() {
  return new RPCLink({
    url: API_URL,
    interceptors: [
      onError((error: unknown) => {
        console.error('oRPC API Error:', error);
        
        if (error && typeof error === 'object' && 'message' in error) {
          const message = String(error.message).toLowerCase();
          if (message.includes('fetch') || message.includes('network') || message.includes('failed to fetch')) {
            toast.error('Unable to connect to API', {
              id: 'api-connection-error',
              description: 'The API is currently unavailable. Please try again later.',
            });
          }
        }
      }),
    ],
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: 'include',
      });
    },
  });
}

export type ApiContract = typeof contract;
export type ApiClient = ContractRouterClient<ApiContract>;

export const apiClient: ApiClient = createORPCClient(createApiLink());
