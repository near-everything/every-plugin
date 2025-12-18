import { useQuery, useSuspenseQuery, useQueries } from '@tanstack/react-query';
import { apiClient, queryClient } from '@/utils/orpc';
import { productKeys, type ProductCategory } from './keys';
import { HIDDEN_PRODUCT_IDS, PRODUCT_MERGES, getMergeTargetId } from './merges';

export type Product = Awaited<ReturnType<typeof apiClient.getProduct>>['product'];
export type ProductImage = Product['images'][number];

export function useProducts(options?: {
  category?: ProductCategory;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: productKeys.list({
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    }),
    queryFn: async () => {
      const data = await apiClient.getProducts({
        category: options?.category,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      });

      return {
        ...data,
        products: data.products.filter(p => !HIDDEN_PRODUCT_IDS.includes(p.id))
      };
    },
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: async () => {
      const targetId = getMergeTargetId(id);

      if (!targetId) {
        const data = await apiClient.getProduct({ id });
        return {
          product: data.product,
          mergedProducts: undefined
        };
      }

      const sourceIds = PRODUCT_MERGES[targetId] || [];
      const allIds = [targetId, ...sourceIds];

      const results = await Promise.all(
        allIds.map(pid => apiClient.getProduct({ id: pid }))
      );

      return {
        product: results[0].product,
        mergedProducts: results.map(r => r.product)
      };
    },
    enabled: !!id,
    placeholderData: (prev) => prev,
  });
}

export function useSuspenseProduct(id: string) {
  return useSuspenseQuery({
    queryKey: productKeys.detail(id),
    queryFn: async () => {
      const targetId = getMergeTargetId(id);

      if (!targetId) {
        const data = await apiClient.getProduct({ id });
        return {
          product: data.product,
          mergedProducts: undefined
        };
      }

      const sourceIds = PRODUCT_MERGES[targetId] || [];
      const allIds = [targetId, ...sourceIds];

      const results = await Promise.all(
        allIds.map(pid => apiClient.getProduct({ id: pid }))
      );

      return {
        product: results[0].product,
        mergedProducts: results.map(r => r.product)
      };
    },
  });
}

export function useFeaturedProducts(limit = 12) {
  return useQuery({
    queryKey: productKeys.featured(limit),
    queryFn: async () => {
      const data = await apiClient.getFeaturedProducts({ limit });
      return {
        ...data,
        products: data.products.filter(p => !HIDDEN_PRODUCT_IDS.includes(p.id))
      };
    },
    placeholderData: (prev) => prev,
  });
}

export function useSuspenseFeaturedProducts(limit = 12) {
  return useSuspenseQuery({
    queryKey: productKeys.featured(limit),
    queryFn: async () => {
      const data = await apiClient.getFeaturedProducts({ limit });
      return {
        ...data,
        products: data.products.filter(p => !HIDDEN_PRODUCT_IDS.includes(p.id))
      };
    },
  });
}

export function useSearchProducts(query: string, options?: {
  category?: ProductCategory;
  limit?: number;
}) {
  return useQuery({
    queryKey: productKeys.search(query, options?.category, options?.limit),
    queryFn: async () => {
      const data = await apiClient.searchProducts({
        query,
        category: options?.category,
        limit: options?.limit ?? 20,
      });
      return {
        ...data,
        products: data.products.filter(p => !HIDDEN_PRODUCT_IDS.includes(p.id))
      };
    },
    enabled: query.length > 0,
  });
}

export function useSuspenseSearchProducts(query: string, options?: {
  category?: ProductCategory;
  limit?: number;
}) {
  return useSuspenseQuery({
    queryKey: productKeys.search(query, options?.category, options?.limit),
    queryFn: async () => {
      const data = await apiClient.searchProducts({
        query,
        category: options?.category,
        limit: options?.limit ?? 20,
      });
      return {
        ...data,
        products: data.products.filter(p => !HIDDEN_PRODUCT_IDS.includes(p.id))
      };
    },
  });
}

export function useProductsByIds(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: productKeys.detail(id),
      queryFn: () => apiClient.getProduct({ id }),
      enabled: !!id,
    })),
    combine: (results) => ({
      data: results.map((r) => r.data?.product).filter(Boolean) as Product[],
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
    }),
  });
}

export const productLoaders = {
  featured: (limit = 12) => ({
    queryKey: productKeys.featured(limit),
    queryFn: () => apiClient.getFeaturedProducts({ limit }),
  }),

  detail: (id: string) => ({
    queryKey: productKeys.detail(id),
    queryFn: () => apiClient.getProduct({ id }),
  }),

  list: (options?: { category?: ProductCategory; limit?: number; offset?: number }) => ({
    queryKey: productKeys.list({
      category: options?.category,
      limit: options?.limit,
      offset: options?.offset,
    }),
    queryFn: () =>
      apiClient.getProducts({
        category: options?.category,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      }),
  }),

  search: (query: string, options?: { category?: ProductCategory; limit?: number }) => ({
    queryKey: productKeys.search(query, options?.category, options?.limit),
    queryFn: () =>
      apiClient.searchProducts({
        query,
        category: options?.category,
        limit: options?.limit ?? 50,
      }),
  }),

  prefetchFeatured: async (limit = 8) => {
    await queryClient.prefetchQuery(productLoaders.featured(limit));
  },

  prefetchProduct: async (id: string) => {
    await queryClient.prefetchQuery(productLoaders.detail(id));
  },

  prefetchList: async (options?: { category?: ProductCategory; limit?: number; offset?: number }) => {
    await queryClient.prefetchQuery(productLoaders.list(options));
  },

  prefetchSearch: async (query: string, options?: { category?: ProductCategory; limit?: number }) => {
    await queryClient.prefetchQuery(productLoaders.search(query, options));
  },
};
