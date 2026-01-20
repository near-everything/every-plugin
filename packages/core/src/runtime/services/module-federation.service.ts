import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Effect } from "effect";
import { getMajorMinorVersion } from "../../build/shared-deps";
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
							get: () => import("every-plugin").then(mod => () => mod),
							shareConfig: {
								singleton: true,
								requiredVersion: getMajorMinorVersion(pkg.version),
								eager: false,
								strictVersion: false,
							},
						},
						effect: {
							version: pkg.dependencies.effect,
							get: () => import("effect").then(mod => () => mod),
							shareConfig: {
								singleton: true,
								requiredVersion: getMajorMinorVersion(pkg.dependencies.effect),
								eager: false,
								strictVersion: false,
							},
						},
						zod: {
							version: pkg.dependencies.zod,
							get: () => import("zod").then(mod => () => mod),
							shareConfig: {
								singleton: true,
								requiredVersion: getMajorMinorVersion(pkg.dependencies.zod),
								eager: false,
								strictVersion: false,
							},
						},
						"@orpc/contract": {
							version: pkg.dependencies["@orpc/contract"],
							get: () => import("@orpc/contract").then(mod => () => mod),
							shareConfig: {
								singleton: true,
								requiredVersion: getMajorMinorVersion(pkg.dependencies["@orpc/contract"]),
								eager: false,
								strictVersion: false,
							},
						},
						"@orpc/server": {
							version: pkg.dependencies["@orpc/server"],
							get: () => import("@orpc/server").then(mod => () => mod),
							shareConfig: {
								singleton: true,
								requiredVersion: getMajorMinorVersion(pkg.dependencies["@orpc/server"]),
								eager: false,
								strictVersion: false,
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

					const remoteName = getNormalizedRemoteName(pluginId);

					yield* Effect.try({
						try: () => mf.registerRemotes([{
							name: remoteName,
							entry: url,
						}]),
						catch: (error): ModuleFederationError =>
							new ModuleFederationError({
								pluginId,
								remoteUrl: url,
								cause:
									error instanceof Error ? error : new Error(String(error)),
							}),
					});

					console.log(`[MF] ✅ Registered ${pluginId}`);
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
							let Constructor: any;

							if (typeof container === "function") {
								// Direct function export
								Constructor = container;
							} else if (container.default) {
								// Default export
								Constructor = container.default;
							} else {
								// Named export fallback - prioritize exports with 'binding' property (plugin classes)
								Constructor = Object.values(container).find(
									(exp) => typeof exp === "function" && (exp as any).binding !== undefined
								);

								// Fallback to any function export if no binding found
								if (!Constructor) {
									Constructor = Object.values(container).find(
										(exp) => typeof exp === "function" && exp.prototype?.constructor === exp
									);
								}
							}

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
}) { }
