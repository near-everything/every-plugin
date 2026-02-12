// ============================================================================
// Route Provider for Module Federation
// ============================================================================
// This file exports the route tree for consumption by the Host application.
// The Host will import these routes and merge them into its own router.
//
// NOTE: This is NOT a router - just the route definitions!
// ============================================================================

import { routeTree } from "./routeTree.gen";

// Export the generated route tree
export { routeTree };

// Also export the types for type safety
export type {
	ClientRuntimeConfig,
	RouterContext,
	RouterModule,
} from "./types";
