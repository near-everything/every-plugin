import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Effect, Schedule } from "every-plugin/effect";
import type { RouterModule } from "../types";
import type { RuntimeConfig } from "./config";
import { FederationError } from "./errors";

export type { RouterModule };

let federationInstance: ReturnType<typeof createInstance> | null = null;

/**
 * Creates or retrieves the Module Federation instance for loading SSR modules.
 *
 * In local dev mode, if ssrUrl is undefined, falls back to ui.url.
 * In production mode, ssrUrl must be properly configured.
 */
function getOrCreateFederationInstance(config: RuntimeConfig) {
	if (federationInstance) return federationInstance;

	const existingInstance = getInstance();
	const isLocalDev = config.ui.source === "local";
	const ssrUrl = config.ui.ssrUrl ?? (isLocalDev ? config.ui.url : undefined);

	if (!ssrUrl) {
		if (!isLocalDev) {
			throw new FederationError({
				remoteName: config.ui.name,
				cause: new Error(
					"SSR URL not configured in production. Set app.ui.ssr in bos.config.json to enable SSR.",
				),
			});
		}
		throw new Error(
			"SSR URL not configured. In local dev, set app.ui.ssr or use a UI package with SSR support.",
		);
	}

	const ssrEntryUrl = `${ssrUrl}/remoteEntry.server.js`;

	if (existingInstance) {
		existingInstance.registerRemotes([
			{
				name: config.ui.name,
				entry: ssrEntryUrl,
				alias: config.ui.name,
			},
		]);
		federationInstance = existingInstance;
		return federationInstance;
	}

	federationInstance = createInstance({
		name: "host",
		remotes: [
			{
				name: config.ui.name,
				entry: ssrEntryUrl,
				alias: config.ui.name,
			},
		],
		// NOTE: Shared dependency management is currently disabled due to Module Federation
		// compatibility issues. To enable: implement proper transformation of config.shared?.ui
		// and pass it as `shared: { shared }` to createInstance. See:
		// https://module-federation.io/api/containers/#createInstance
	});

	setGlobalFederationInstance(federationInstance);
	return federationInstance;
}

const retrySchedule = Schedule.addDelay(Schedule.recurs(5), () => 500);

export const loadRouterModule = (config: RuntimeConfig) =>
	Effect.tryPromise({
		try: async () => {
			const mf = getOrCreateFederationInstance(config);
			const routerModule = await mf.loadRemote<RouterModule>(
				`${config.ui.name}/Router`,
			);

			if (!routerModule) {
				throw new Error(`Module not found: ${config.ui.name}/Router`);
			}

			return routerModule;
		},
		catch: (e) =>
			new FederationError({
				remoteName: config.ui.name,
				remoteUrl: config.ui.ssrUrl,
				cause: e,
			}),
	}).pipe(
		Effect.retry(retrySchedule),
		Effect.timeout("30 seconds"),
		Effect.tapBoth({
			onSuccess: () => Effect.logInfo("[SSR] Router module ready"),
			onFailure: (error: Error) =>
				Effect.logError(`[SSR] Failed: ${error.message}`),
		}),
	);
