import { queryOptions } from '@tanstack/react-query';
import { authClient } from './auth-client';

export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const { data: session } = await authClient.getSession();
    return session;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 10,
});
