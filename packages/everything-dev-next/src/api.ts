import { Effect } from "effect";
import { createPluginRuntime, type PluginRuntime } from "every-plugin";
import {
	ensureNodeRuntimePlugin,
	loadRemoteModule,
	registerRemote,
} from "./mf";
import type { RuntimeConfig } from "./types";

export interface ApiPluginResult {
	name: string;
	router: any;
	client: any;
	metadata: {
		remoteUrl: string;
		version?: string;
	};
}

export async function loadApiPlugin(opts: {
	name: string;
	entry: string;
	variables?: Record<string, string>;
	secrets?: Record<string, string>;
}): Promise<ApiPluginResult> {
	const remoteEntryUrl = (() => {
		if (opts.entry.endsWith("/remoteEntry.js")) return opts.entry;
		if (opts.entry.endsWith("/mf-manifest.json")) {
			return `${opts.entry.replace(/\/mf-manifest\.json$/, "")}/remoteEntry.js`;
		}
		if (opts.entry.endsWith(".js")) return opts.entry;
		return `${opts.entry.replace(/\/$/, "")}/remoteEntry.js`;
	})();

	await ensureNodeRuntimePlugin();
	// Use remoteEntry.js for the plugin runtime for now. mf-manifest.json support
	// is still inconsistent across our stack.
	await registerRemote({ name: opts.name, entry: remoteEntryUrl });

	const runtime = createPluginRuntime({
		registry: {
			[opts.name]: { remote: remoteEntryUrl },
		},
		secrets: opts.secrets ?? {},
	});

	const plugin = await runtime.usePlugin(opts.name, {
		variables: opts.variables ?? {},
		secrets: opts.secrets ?? {},
	});

	return {
		name: opts.name,
		router: plugin.router,
		client: plugin.createClient(),
		metadata: {
			remoteUrl: remoteEntryUrl,
			version: plugin.metadata.version,
		},
	};
}

export async function loadApiPluginsFromRuntimeConfig(
	runtimeConfig: RuntimeConfig,
	envSecrets?: Record<string, string>,
): Promise<ApiPluginResult | null> {
	const apiConfig = runtimeConfig.api;
	if (!apiConfig) {
		console.log("[API] No API plugin configured");
		return null;
	}

	if (!apiConfig.url) {
		console.log("[API] No API URL configured");
		return null;
	}

	console.log(
		`[API] Loading plugin: ${apiConfig.name} from ${apiConfig.entry}`,
	);

	const secrets: Record<string, string> = {};
	if (apiConfig.secrets) {
		for (const key of apiConfig.secrets) {
			const value = envSecrets?.[key] ?? process.env[key];
			if (value) {
				secrets[key] = value;
			}
		}
	}

	return loadApiPlugin({
		name: apiConfig.name,
		entry: apiConfig.entry,
		variables: apiConfig.variables,
		secrets,
	});
}

export function createStitchedRouter(
	baseRouter: any,
	apiPlugin: ApiPluginResult | null,
): any {
	if (!apiPlugin) {
		return baseRouter;
	}

	return {
		...baseRouter,
		...apiPlugin.router,
	};
}
