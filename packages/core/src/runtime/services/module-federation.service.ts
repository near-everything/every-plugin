import {
	createInstance,
	getInstance,
} from "@module-federation/runtime";
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
		let instance = getInstance();

		if (!instance) {
			instance = createInstance({
				name: "host",
				remotes: [],
				// plugins: [nodeRuntimePlugin()],
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
					const manifestExists = yield* Effect.tryPromise({
						try: async () => {
							const response = await fetch(manifestUrl, { method: "HEAD" });
							return response.ok;
						},
						catch: () => false, // If fetch fails, manifest doesn't exist
					});

					let entryUrl: string;
					let isManifestMode = false;

					if (manifestExists) {
						// MF 2.0 manifest mode - fetch manifest and extract remoteEntry URL
						const manifest: any = yield* Effect.tryPromise({
							try: () => fetch(manifestUrl).then(r => r.json()),
							catch: (error) => {
								console.log(`[MF] ⚠️ Failed to fetch manifest for ${pluginId}, falling back to MF 1.5:`, error);
								throw error;
							}
						});

						// Extract remoteEntry from manifest metaData
						const remoteEntryName = manifest.metaData?.remoteEntry?.name || 'remoteEntry.js';
						entryUrl = url.endsWith('/') ? `${url}${remoteEntryName}` : `${url}/${remoteEntryName}`;
						isManifestMode = true;
						console.log(`[MF] Using MF 2.0 manifest mode for ${pluginId} (remoteEntry: ${remoteEntryName})`);
					} else {
						// Fallback to MF 1.5 direct mode - assume URL points to remoteEntry.js
						console.log(`[MF] ⚠️ Manifest not found, falling back to MF 1.5 mode for ${pluginId}`);
						entryUrl = url;
						isManifestMode = false;
					}

					// For MF 2.0, the name can be the pluginId
					// The manifest will contain the actual container name
					const remoteName = isManifestMode ? pluginId : getNormalizedRemoteName(pluginId);

					yield* Effect.try({
						try: () => mf.registerRemotes([{
							name: remoteName,
							entry: entryUrl
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
					const manifestUrl = url.endsWith('/')
						? `${url}mf-manifest.json`
						: `${url}/mf-manifest.json`;

					// Check if manifest is available (MF 2.0 with manifests)
					const manifestExists = yield* Effect.tryPromise({
						try: async () => {
							const response = await fetch(manifestUrl, { method: "HEAD" });
							return response.ok;
						},
						catch: () => false, // If fetch fails, manifest doesn't exist
					});

					// Use same naming logic as registerRemote
					const remoteName = manifestExists ? pluginId : getNormalizedRemoteName(pluginId);
					const isManifestMode = manifestExists;

					console.log(`[MF] Loading remote ${remoteName} (${isManifestMode ? 'MF 2.0' : 'MF 1.5'})`);
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
								throw new Error(`No valid plugin constructor found for '${pluginId}'`);
							}

							// Validate it looks like a plugin constructor (has binding property)
							if (!(Constructor as any).binding) {
								throw new Error(`Invalid plugin constructor for '${pluginId}' - missing binding property`);
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
}) { }
