import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/utils/orpc';
import { orderKeys } from './keys';

export type CreateCheckoutInput = Awaited<Parameters<typeof apiClient.createCheckout>[0]>;
export type CreateCheckoutOutput = Awaited<ReturnType<typeof apiClient.createCheckout>>;
export type QuoteInput = Awaited<Parameters<typeof apiClient.quote>[0]>;
export type QuoteOutput = Awaited<ReturnType<typeof apiClient.quote>>;

export function useCreateCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateCheckoutInput): Promise<CreateCheckoutOutput> => {
      return await apiClient.createCheckout(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

export function useGetShippingQuote() {
  return useMutation({
    mutationFn: async (params: QuoteInput): Promise<QuoteOutput> => {
      return await apiClient.quote(params);
    },
  });
}
