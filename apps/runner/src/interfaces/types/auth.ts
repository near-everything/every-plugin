import type { z } from "zod";
import {
	type authenticatedContextSchema,
	type jwtPayloadSchema,
	UserRole,
	type userSchema,
} from "../schemas/auth";

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export { UserRole };

export type User = z.infer<typeof userSchema>;
export type JWTPayload = z.infer<typeof jwtPayloadSchema>;
export type AuthenticatedContext = z.infer<typeof authenticatedContextSchema>;
