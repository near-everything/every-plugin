/**
 * TanStack Start Server Entry Point
 *
 * This file exports a fetch handler that TanStack Start uses for SSR.
 * It's loaded by the Start plugin during the SSR build.
 *
 * The router is loaded asynchronously on first request via getRouter(),
 * which fetches the UI routeTree from the configured remote URL.
 */
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";

// Polyfill for MF runtime in Node.js environment
if (!globalThis.self) {
	(globalThis as any).self = globalThis;
}

// Create the Start SSR handler
// The router will be loaded by the app when it initializes
const handler = createStartHandler(defaultStreamHandler);

// Export fetch handler for the server
export const fetch = handler;

// Default export for compatibility
export default { fetch };
