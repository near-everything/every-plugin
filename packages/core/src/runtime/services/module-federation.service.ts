import { betterFetch } from "@better-fetch/fetch";
import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Effect } from "effect";
import type { AnyPlugin } from "../../types";
import { ModuleFederationError } from "../errors";
import { getNormalizedRemoteName } from "./normalize";

type RemoteModule = 
  | (new () => AnyPlugin)
  | { default: new () => AnyPlugin };

import pkg from "../../../package.json";

const createModuleFederationInstance = Effect.cached(
	Effect.sync(() => {
		try {
			let instance = getInstance();

			if (!instance) {
				instance = createInstance({
					name: "host",
					remotes: [],
					shared: {
						"every-plugin": {
							version: pkg.version,
							shareConfig: {
								singleton: true,
								requiredVersion: `^${pkg.version}`,
								eager: true,
								strictVersion: false, // Allow bidirectional version compatibility
							},
						},
						effect: {
							version: pkg.dependencies.effect,
							shareConfig: {
								singleton: true,
								requiredVersion: "^3.18.0", // Allow any 3.18.x patch version
								eager: true,
								strictVersion: false, // Allow version flexibility for compatibility
							},
						},
						zod: {
							version: pkg.dependencies.zod,
							shareConfig: {
								singleton: true,
								requiredVersion: "^4.1.0", // Allow any 4.1.x patch version
								eager: true,
								strictVersion: false, // Allow version flexibility for compatibility
							},
						},
						"@orpc/contract": {
							version: pkg.dependencies["@orpc/contract"],
							shareConfig: {
								singleton: true,
								requiredVersion: "^1.8.0", // Allow any 1.8.x patch version
								eager: true,
								strictVersion: false, // Allow version flexibility for compatibility
							},
						},
						"@orpc/server": {
							version: pkg.dependencies["@orpc/server"],
							shareConfig: {
								singleton: true,
								requiredVersion: "^1.8.0", // Allow any 1.8.x patch version
								eager: true,
								strictVersion: false, // Allow version flexibility for compatibility
							},
						}
					},
				});

				setGlobalFederationInstance(instance);
			}

			return instance;
		} catch (error) {
			throw new Error(`Failed to initialize Module Federation: ${error}`);
		}
	}),
);

export class ModuleFederationService extends Effect.Service<ModuleFederationService>()("ModuleFederationService", {
	effect: Effect.gen(function* () {
		const mf = yield* Effect.flatten(createModuleFederationInstance);

		return {
			registerRemote: (pluginId: string, url: string) =>
				Effect.gen(function* () {
					console.log(`[MF] Registering ${pluginId}`);

					const manifestUrl = url.endsWith('/')
						? `${url}mf-manifest.json`
						: `${url}/mf-manifest.json`;

					// Check if manifest is available (MF 2.0 with manifests)
					const { error: manifestError } = yield* Effect.tryPromise({
						try: () => betterFetch(manifestUrl, { method: "HEAD" }),
						catch: (error) => error, // Don't fail yet, try fallback
					});

					let entryUrl: string;
					let isManifestMode = false;

					if (!manifestError) {
						// MF 2.0 manifest mode - use manifest URL
						entryUrl = manifestUrl;
						isManifestMode = true;
						console.log(`[MF] Using MF 2.0 manifest mode for ${pluginId}`);
					} else {
						// Fallback to MF 1.5 direct mode - assume URL points to remoteEntry.js
						console.log(`[MF] ⚠️ Manifest not found, falling back to MF 1.5 mode for ${pluginId}`);
						entryUrl = url;
						isManifestMode = false;
					}

					// For MF 2.0, the name can be the pluginId (alias)
					// The manifest will contain the actual container name
					const remoteName = isManifestMode ? pluginId : getNormalizedRemoteName(pluginId);

					yield* Effect.try({
						try: () => mf.registerRemotes([{
							name: remoteName,
							entry: entryUrl,
							...(isManifestMode && { alias: pluginId }) // Explicit alias for clarity
						}]),
						catch: (error): ModuleFederationError =>
							new ModuleFederationError({
								pluginId,
								remoteUrl: url,
								cause:
									error instanceof Error ? error : new Error(String(error)),
							}),
					});

					console.log(`[MF] ✅ Registered ${pluginId} (${isManifestMode ? 'MF 2.0' : 'MF 1.5'})`);
				}),

			loadRemoteConstructor: (pluginId: string, url: string) =>
				Effect.gen(function* () {
					const remoteName = getNormalizedRemoteName(pluginId);
					console.log(`[MF] Loading remote ${remoteName}`);
					const modulePath = `${remoteName}/plugin`;

					return yield* Effect.tryPromise({
						try: async () => {

							const container = await mf.loadRemote<RemoteModule>(modulePath);
							if (!container) {
								throw new Error(`No container returned for ${modulePath}`);
							}

							// Support multiple export patterns: direct function, default export, named exports
							const Constructor =
								typeof container === "function"
									? container  // Direct function export
									: container.default
									? container.default  // Default export
									: Object.values(container).find(  // Named export fallback
											(exp) => typeof exp === "function" && exp.prototype?.constructor === exp
										);

							if (!Constructor || typeof Constructor !== "function") {
								const containerInfo = typeof container === "object"
									? `Available exports: ${Object.keys(container).join(', ')}`
									: `Container type: ${typeof container}`;

								throw new Error(
									`No valid plugin constructor found for '${pluginId}'.\n` +
									`Supported patterns:\n` +
									`  - export const YourPlugin = createPlugin({...})\n` +
									`  - export default createPlugin({...})\n` +
									`${containerInfo}`,
								);
							}

							// Validate it looks like a plugin constructor (has binding property)
							if (!(Constructor as any).binding) {
								const containerInfo = typeof container === "object"
									? `Found exports: ${Object.keys(container).join(', ')}`
									: `Container type: ${typeof container}`;

								throw new Error(
									`Invalid plugin constructor for '${pluginId}'. ` +
									`The exported value must be created with createPlugin(). ` +
									`Found a function but it's missing the required 'binding' property.\n` +
									`${containerInfo}`,
								);
							}

							console.log(`[MF] ✅ Loaded constructor for ${pluginId}`);
							return Constructor;
						},
						catch: (error): ModuleFederationError =>
							new ModuleFederationError({
								pluginId,
								remoteUrl: url,
								cause:
									error instanceof Error ? error : new Error(String(error)),
							}),
					});
				}),
		};
	}),
}) {}
