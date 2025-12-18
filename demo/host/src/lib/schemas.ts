import { z } from "every-plugin/zod";

// Canonical shipping address schema
export const ShippingAddressSchema = z.object({
  companyName: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postCode: z.string().min(1),
  country: z.string().length(2), // ISO country code
  email: z.email(),
  phone: z.string().min(1).optional(),
});

export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

// Delivery estimate schema
export const DeliveryEstimateSchema = z.object({
  minDeliveryDate: z.string(),
  maxDeliveryDate: z.string(),
});

export type DeliveryEstimate = z.infer<typeof DeliveryEstimateSchema>;
