import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { apiClient, queryClient } from '@/utils/orpc';
import { orderKeys } from './keys';

export type Order = Awaited<ReturnType<typeof apiClient.getOrder>>['order'];

type OrderBySessionResult = Awaited<ReturnType<typeof apiClient.getOrderByCheckoutSession>>;

export function useOrderByCheckoutSession(
  sessionId: string | undefined,
  options?: {
    refetchInterval?: number | false | ((query: { state: { data?: OrderBySessionResult } }) => number | false);
  }
) {
  return useQuery({
    queryKey: [...orderKeys.all, 'by-session', sessionId],
    queryFn: () => apiClient.getOrderByCheckoutSession({ sessionId: sessionId! }),
    enabled: !!sessionId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useOrders(options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: orderKeys.list({ limit: options?.limit, offset: options?.offset }),
    queryFn: () =>
      apiClient.getOrders({
        limit: options?.limit ?? 10,
        offset: options?.offset ?? 0,
      }),
  });
}

export function useSuspenseOrders(options?: { limit?: number; offset?: number }) {
  return useSuspenseQuery({
    queryKey: orderKeys.list({ limit: options?.limit, offset: options?.offset }),
    queryFn: () =>
      apiClient.getOrders({
        limit: options?.limit ?? 10,
        offset: options?.offset ?? 0,
      }),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiClient.getOrder({ id }),
    enabled: !!id,
  });
}

export function useSuspenseOrder(id: string) {
  return useSuspenseQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiClient.getOrder({ id }),
  });
}

export const orderLoaders = {
  list: (options?: { limit?: number; offset?: number }) => ({
    queryKey: orderKeys.list({ limit: options?.limit, offset: options?.offset }),
    queryFn: () =>
      apiClient.getOrders({
        limit: options?.limit ?? 10,
        offset: options?.offset ?? 0,
      }),
  }),

  detail: (id: string) => ({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiClient.getOrder({ id }),
  }),

  prefetchOrders: async (options?: { limit?: number; offset?: number }) => {
    await queryClient.prefetchQuery(orderLoaders.list(options));
  },

  prefetchOrder: async (id: string) => {
    await queryClient.prefetchQuery(orderLoaders.detail(id));
  },
};
