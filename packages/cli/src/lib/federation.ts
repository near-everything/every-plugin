/**
 * Unified Module Federation Runtime Helper
 *
 * Provides a single, boring, reliable way to:
 * - Ensure a singleton MF instance per realm
 * - Apply Node.js polyfills once
 * - Register remotes by manifest URL (primary) or remoteEntry.js (fallback)
 * - Load remote modules
 *
 * This module owns the MF instance lifecycle and removes the need for
 * `init()`, `getInstance()`, and `setGlobalFederationInstance()` patterns.
 */

import { Effect } from "effect";

export type RemoteEntry = string;

// Internal singleton state
let _mfInstance: any = null;
let _nodePolyfillsApplied = false;
const _isClient = typeof window !== "undefined";

/**
 * Apply Node.js polyfills once for Module Federation runtime.
 * Safe to call multiple times - only applies on first call in Node environment.
 */
function ensureNodePolyfills(): void {
	if (_isClient) return; // Browser doesn't need these
	if (_nodePolyfillsApplied) return;

	// MF runtime expects `self` to exist in Node
	if (!globalThis.self) {
		(globalThis as any).self = globalThis;
	}

	_nodePolyfillsApplied = true;
}

/**
 * Canonical entry URL computation.
 *
 * Rules:
 * - If URL already ends with .js or .json, treat as explicit entry (don't rewrite)
 * - Otherwise, append /mf-manifest.json for manifest-first loading
 *
 * @param baseUrl - Base URL from config (e.g., https://cdn.example.com/v123/ui)
 * @returns Computed federation entry URL
 */
export function computeFederationEntry(baseUrl: string): RemoteEntry {
	if (!baseUrl) return baseUrl;

	// If already an explicit entry URL, leave it alone
	if (baseUrl.endsWith(".js") || baseUrl.endsWith(".json")) {
		return baseUrl;
	}

	// Default to manifest-first approach
	const cleanUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	return `${cleanUrl}/mf-manifest.json`;
}

/**
 * Ensure we have a MF instance, creating one if needed.
 * This is the ONLY place we call MF runtime APIs.
 */
async function ensureMfInstance(): Promise<any> {
	if (_mfInstance) return _mfInstance;

	ensureNodePolyfills();

	const { createInstance } = await import(
		"@module-federation/enhanced/runtime"
	);

	// Create instance with no initial remotes (we'll register them explicitly)
	_mfInstance = createInstance({
		name: "everything-dev-runtime",
		remotes: [],
	});

	return _mfInstance;
}

/**
 * Register a remote module by its entry URL.
 * Idempotent: safe to call multiple times with the same name.
 *
 * @param name - Remote container name (e.g., "ui", "host", "api")
 * @param entry - Entry URL (manifest.json or remoteEntry.js)
 * @param options - Optional type hint ("manifest" | "script")
 */
export async function registerRemote(
	name: string,
	entry: RemoteEntry,
	options: { type?: "manifest" | "script" } = {},
): Promise<void> {
	const mf = await ensureMfInstance();

	// Auto-detect type from URL if not specified
	const type =
		options.type ?? (entry.endsWith(".json") ? "manifest" : "script");

	mf.registerRemotes([
		{
			name,
			entry,
			type,
		},
	]);
}

/**
 * Load a remote module by its ID.
 *
 * @param id - Module ID in format "remoteName/expose" (e.g., "ui/Routes", "host/Server")
 * @returns Loaded module or null
 */
export async function loadRemote<T = any>(id: string): Promise<T | null> {
	const mf = await ensureMfInstance();
	return mf.loadRemote<T>(id);
}

/**
 * Load a remote module with Effect wrapper for error handling.
 *
 * @param id - Module ID
 * @param errorMessage - Custom error message prefix
 */
export function loadRemoteEffect<T = any>(
	id: string,
	errorMessage = "Failed to load remote module",
): Effect.Effect<T, Error> {
	return Effect.tryPromise({
		try: () =>
			loadRemote<T>(id).then((mod) => {
				if (!mod)
					throw new Error(`${errorMessage}: ${id} - module returned null`);
				return mod;
			}),
		catch: (error: unknown) => new Error(`${errorMessage} ${id}: ${error}`),
	});
}

/**
 * Get the internal MF instance (for advanced use cases).
 * Prefer using registerRemote() and loadRemote() instead.
 */
export async function getMfInstance(): Promise<any> {
	return ensureMfInstance();
}

/**
 * Reset the internal state (useful for testing).
 */
export function resetFederationState(): void {
	_mfInstance = null;
	_nodePolyfillsApplied = false;
}
