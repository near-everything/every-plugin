import { os } from "@orpc/server";

// Simple public procedure - no auth, etc.
export const publicProcedure = os.$context<Record<never, never>>();
