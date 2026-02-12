import { Effect, Layer, ManagedRuntime } from "every-plugin/effect";
import type { RuntimeConfig } from "everything-dev/types";
import { BaseLive, PluginsLive } from "@/layers";
import { type Auth, AuthService } from "@/services/auth";
import { ConfigService } from "@/services/config";
import { type Database, DatabaseService } from "@/services/database";
import type { PluginResult } from "@/services/plugins";
import { PluginsService } from "@/services/plugins";

export interface ServerServices {
	config: RuntimeConfig;
	auth: Auth;
	db: Database;
	plugins: PluginResult;
}

function readRuntimeConfigFromEnv(): RuntimeConfig {
	const json = process.env.BOS_RUNTIME_CONFIG;
	if (!json) {
		throw new Error(
			"BOS_RUNTIME_CONFIG is required (start the host through `bos dev` or `bos start`)" +
				"",
		);
	}
	try {
		return JSON.parse(json) as RuntimeConfig;
	} catch (e) {
		throw new Error(`Failed to parse BOS_RUNTIME_CONFIG: ${String(e)}`);
	}
}

let runtime: ManagedRuntime.ManagedRuntime<never, never> | null = null;
let servicesPromise: Promise<ServerServices> | null = null;

function getRuntime(): ManagedRuntime.ManagedRuntime<never, never> {
	if (runtime) return runtime;

	const runtimeConfig = readRuntimeConfigFromEnv();
	const ConfigLive = Layer.succeed(ConfigService, runtimeConfig);
	const AppLive = Layer.provideMerge(
		Layer.mergeAll(BaseLive, PluginsLive),
		ConfigLive,
	);

	runtime = ManagedRuntime.make(AppLive);
	return runtime;
}

export function getServerServices(): Promise<ServerServices> {
	if (servicesPromise) return servicesPromise;

	const rt = getRuntime();

	servicesPromise = rt.runPromise(
		Effect.gen(function* () {
			const config = yield* ConfigService;
			const auth = yield* AuthService;
			const db = yield* DatabaseService;
			const plugins = yield* PluginsService;

			return { config, auth, db, plugins } satisfies ServerServices;
		}),
	);

	return servicesPromise;
}
