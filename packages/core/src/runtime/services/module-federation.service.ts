import { betterFetch } from "@better-fetch/fetch";
import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import * as EffectModule from "effect";
import { Effect, Layer } from "effect";
import * as ZodModule from "zod";
import { ModuleFederationError } from "../errors";

export interface IModuleFederationService {
	readonly registerRemote: (
		pluginId: string,
		url: string,
	) => Effect.Effect<void, ModuleFederationError>;
	readonly loadRemoteConstructor: (
		pluginId: string,
		url: string,
	) => Effect.Effect<any, ModuleFederationError>;
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
						effect: {
							shareConfig: {
								singleton: true,
								requiredVersion: "^3.17.6",
								eager: true,
							},
							lib: () => EffectModule,
						},
						zod: {
							shareConfig: {
								singleton: true,
								requiredVersion: "^4.0.8",
								eager: true,
							},
							lib: () => ZodModule,
						},
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
							return yield* Effect.fail(
								new ModuleFederationError({
									pluginId,
									remoteUrl: url,
									cause: new Error(`Remote not available: ${error}`),
								}),
							);
						}

						// Register remote
						const remoteName = pluginId
							.toLowerCase()
							.replace("@", "")
							.replace("/", "_");

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
					}),

				loadRemoteConstructor: (pluginId: string, url: string) =>
					Effect.gen(function* () {
						const remoteName = pluginId
							.toLowerCase()
							.replace("@", "")
							.replace("/", "_");
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
