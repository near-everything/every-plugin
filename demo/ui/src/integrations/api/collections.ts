import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { apiClient, queryClient } from '@/utils/orpc';
import { collectionKeys } from './keys';

export type Collection = Awaited<ReturnType<typeof apiClient.getCollections>>['collections'][number];

export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.list(),
    queryFn: () => apiClient.getCollections(),
    placeholderData: (prev) => prev,
  });
}

export function useSuspenseCollections() {
  return useSuspenseQuery({
    queryKey: collectionKeys.list(),
    queryFn: () => apiClient.getCollections(),
  });
}

export function useCollection(slug: string) {
  return useQuery({
    queryKey: collectionKeys.detail(slug),
    queryFn: () => apiClient.getCollection({ slug }),
    enabled: !!slug,
    placeholderData: (prev) => prev,
  });
}

export function useSuspenseCollection(slug: string) {
  return useSuspenseQuery({
    queryKey: collectionKeys.detail(slug),
    queryFn: () => apiClient.getCollection({ slug }),
  });
}

export const collectionLoaders = {
  list: () => ({
    queryKey: collectionKeys.list(),
    queryFn: () => apiClient.getCollections(),
  }),

  detail: (slug: string) => ({
    queryKey: collectionKeys.detail(slug),
    queryFn: () => apiClient.getCollection({ slug }),
  }),

  prefetchCollections: async () => {
    await queryClient.prefetchQuery(collectionLoaders.list());
  },

  prefetchCollection: async (slug: string) => {
    await queryClient.prefetchQuery(collectionLoaders.detail(slug));
  },
};
