export type ProductCategory = 'Men' | 'Women' | 'Accessories' | 'Exclusives';

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: { category?: ProductCategory; limit?: number; offset?: number }) =>
    [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  featured: (limit?: number) => [...productKeys.all, 'featured', { limit }] as const,
  search: (query: string, category?: ProductCategory, limit?: number) =>
    [...productKeys.all, 'search', { query, category, limit }] as const,
};

export const collectionKeys = {
  all: ['collections'] as const,
  lists: () => [...collectionKeys.all, 'list'] as const,
  list: () => [...collectionKeys.lists()] as const,
  details: () => [...collectionKeys.all, 'detail'] as const,
  detail: (slug: string) => [...collectionKeys.details(), slug] as const,
};

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: { limit?: number; offset?: number }) =>
    [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};
