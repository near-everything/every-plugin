import { z } from 'every-plugin/zod';

export const PaymentLineItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  unitAmount: z.number().positive(),
  quantity: z.number().int().positive(),
});

export const CheckoutSessionInputSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  items: z.array(PaymentLineItemSchema),
  customerEmail: z.string().email().optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const CheckoutSessionOutputSchema = z.object({
  sessionId: z.string(),
  url: z.string().url(),
});

export const WebhookInputSchema = z.object({
  body: z.string(),
  signature: z.string(),
});

export const WebhookOutputSchema = z.object({
  received: z.boolean(),
  eventType: z.string().optional(),
  orderId: z.string().optional(),
});

export const GetSessionInputSchema = z.object({
  sessionId: z.string(),
});

export const GetSessionOutputSchema = z.object({
  session: z.object({
    id: z.string(),
    status: z.string(),
    paymentStatus: z.string(),
    amountTotal: z.number().optional(),
    currency: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
});

export type PaymentLineItem = z.infer<typeof PaymentLineItemSchema>;
export type CheckoutSessionInput = z.infer<typeof CheckoutSessionInputSchema>;
export type CheckoutSessionOutput = z.infer<typeof CheckoutSessionOutputSchema>;
export type WebhookInput = z.infer<typeof WebhookInputSchema>;
export type WebhookOutput = z.infer<typeof WebhookOutputSchema>;
export type GetSessionInput = z.infer<typeof GetSessionInputSchema>;
export type GetSessionOutput = z.infer<typeof GetSessionOutputSchema>;
