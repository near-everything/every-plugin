import { betterFetch } from "@better-fetch/fetch";
import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Effect, Layer } from "effect";
import type { AnyPlugin } from "../../types";
import { ModuleFederationError } from "../errors";
import { getNormalizedRemoteName } from "./normalize";

export interface IModuleFederationService {
	readonly registerRemote: (
		pluginId: string,
		url: string,
	) => Effect.Effect<void, ModuleFederationError>;
	readonly loadRemoteConstructor: (
		pluginId: string,
		url: string,
	) => Effect.Effect<new () => AnyPlugin, ModuleFederationError>;
}

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
							shareConfig: {
								singleton: true,
								requiredVersion: false,
								eager: true,
								strictVersion: false,
							},
						},
						effect: {
							shareConfig: {
								singleton: true,
								requiredVersion: false,
								eager: true,
								strictVersion: false,
							},
						},
						zod: {
							shareConfig: {
								singleton: true,
								requiredVersion: false,
								eager: true,
								strictVersion: false,
							},
						},
						"@orpc/contract": {
							shareConfig: {
								singleton: true,
								requiredVersion: false,
								eager: true,
								strictVersion: false,
							},
						},
						"@orpc/server": {
							shareConfig: {
								singleton: true,
								requiredVersion: false,
								eager: true,
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

export class ModuleFederationService extends Effect.Tag(
	"ModuleFederationService",
)<ModuleFederationService, IModuleFederationService>() {
	static Live = Layer.effect(
		ModuleFederationService,
		Effect.gen(function* () {
			const mf = yield* Effect.flatten(createModuleFederationInstance);

			return {
				registerRemote: (pluginId: string, url: string) =>
					Effect.gen(function* () {
						console.log(`[MF] Registering ${pluginId}`);

						// Check if remote is available
						const { error } = yield* Effect.tryPromise({
							try: () => betterFetch(url, { method: "HEAD" }),
							catch: (error): ModuleFederationError =>
								new ModuleFederationError({
									pluginId,
									remoteUrl: url,
									cause:
										error instanceof Error ? error : new Error(String(error)),
								}),
						});

						if (error) {
							console.log(`[MF] ❌ Remote not available for ${pluginId}`);
							return yield* Effect.fail(
								new ModuleFederationError({
									pluginId,
									remoteUrl: url,
									cause: new Error(`Remote not available (${url}): ${JSON.stringify(error)}`),
								}),
							);
						}

						// Register remote using normalized name
						const remoteName = getNormalizedRemoteName(pluginId);

						yield* Effect.try({
							try: () => mf.registerRemotes([{ name: remoteName, entry: url }]),
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

								const container = await mf.loadRemote(modulePath);
								if (!container) {
									throw new Error(`No container returned for ${modulePath}`);
								}

								const Constructor =
									typeof container === "function"
										? container
										: (container as any)?.default;

								if (!Constructor || typeof Constructor !== "function") {
									throw new Error(
										`No valid constructor found. Container type: ${typeof container}`,
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
	);
}

export const ModuleFederationServiceTag = ModuleFederationService;
export const ModuleFederationServiceLive = ModuleFederationService.Live;
