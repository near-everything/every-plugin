import { z } from "zod";

// ============================================================================
// AUTHENTICATION SCHEMAS
// ============================================================================

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export const jwtPayloadSchema = z.object({
  id: z.string(),
  isAnonymous: z.boolean(),
  role: z.enum(UserRole),
  banned: z.boolean().optional(),
  iat: z.number(),
  exp: z.number(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable().optional(),
  email: z.string(),
  role: z.enum(Object.values(UserRole) as [UserRole, ...UserRole[]]),
  isAnonymous: z.boolean().optional(),
  banned: z.boolean().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const authenticatedContextSchema = z.object({
  user: userSchema.omit({ createdAt: true, updatedAt: true }),
  session: z.object({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.coerce.date(),
    token: z.string(),
  }),
});
