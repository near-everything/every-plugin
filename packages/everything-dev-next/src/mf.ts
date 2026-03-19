import {
	createInstance,
	type FederationInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import type { SharedUiResolved } from "./shared";

let mfInstance: FederationInstance | null = null;

export function patchManifestFetchForSsrPublicPath(
	mf: FederationInstance,
): void {
	if (!mf || !(mf as any).loaderHook?.lifecycle?.fetch?.on) return;
	if ((mf as any).__everythingDevPatchedManifestFetch === true) return;
	(mf as any).__everythingDevPatchedManifestFetch = true;

	(mf as any).loaderHook.lifecycle.fetch.on((url: unknown, init: unknown) => {
		if (typeof url !== "string" || !url.endsWith("/mf-manifest.json")) {
			return;
		}
		return fetch(url, init as any)
			.then((res) => res.json())
			.then((json: any) => {
				json.metaData = json.metaData ?? {};
				json.metaData.ssrPublicPath =
					json.metaData.ssrPublicPath ??
					url.replace(/\/mf-manifest\.json$/, "/");
				return new Response(JSON.stringify(json), {
					headers: { "content-type": "application/json" },
				});
			});
	});
}

export function getFederationInstance(): FederationInstance {
	if (mfInstance) return mfInstance;

	const existing = getInstance();
	if (existing) {
		mfInstance = existing as FederationInstance;
		setGlobalFederationInstance(mfInstance as any);
		patchManifestFetchForSsrPublicPath(mfInstance);
		return mfInstance;
	}

	mfInstance = createInstance({
		name: "host",
		remotes: [],
	}) as FederationInstance;
	setGlobalFederationInstance(mfInstance as any);
	patchManifestFetchForSsrPublicPath(mfInstance);
	return mfInstance;
}

const SHARED_ALLOWLIST = [
	"react",
	"react-dom",
	"@tanstack/react-router",
	"@tanstack/react-query",
] as const;

function makeSharedGetter(pkgName: string): (() => Promise<() => any>) | null {
	switch (pkgName) {
		case "react":
			return async () => {
				const mod: any = await import("react");
				return () => mod?.default ?? mod;
			};
		case "react-dom":
			return async () => {
				const mod: any = await import("react-dom");
				return () => mod?.default ?? mod;
			};
		case "@tanstack/react-router":
			return async () => {
				const mod: any = await import("@tanstack/react-router");
				return () => mod?.default ?? mod;
			};
		case "@tanstack/react-query":
			return async () => {
				const mod: any = await import("@tanstack/react-query");
				return () => mod?.default ?? mod;
			};
		default:
			return null;
	}
}

export function registerSharedFromResolved(
	shared: SharedUiResolved | null | undefined,
): void {
	if (!shared) return;

	const instance = getFederationInstance();
	const picked: Record<string, any> = {};

	for (const key of SHARED_ALLOWLIST) {
		if (key in shared.deps) {
			picked[key] = shared.deps[key];
		}
	}

	const sharedConfig: any = {};
	for (const [pkgName, dep] of Object.entries(picked)) {
		const get = makeSharedGetter(pkgName);
		if (!get) continue;

		sharedConfig[pkgName] = {
			version: dep.version,
			scope: dep.shareScope,
			shareConfig: {
				requiredVersion: dep.requiredVersion,
				singleton: dep.singleton,
				eager: dep.eager,
				strictVersion: dep.strictVersion,
			},
			get,
		};
	}

	(instance as any).initOptions({
		name: "host",
		remotes: ((instance as any).options?.remotes as any[]) ?? [],
		shared: sharedConfig,
	});
}

export async function registerRemote(opts: {
	name: string;
	entry: string;
	type?: "manifest" | "script";
}): Promise<void> {
	const instance = getFederationInstance();

	const inferType = (): "manifest" | "script" => {
		if (opts.type) return opts.type;
		if (opts.entry.endsWith("/mf-manifest.json")) return "manifest";
		if (opts.entry.endsWith("/remoteEntry.js")) return "script";
		return typeof window === "undefined" ? "script" : "manifest";
	};

	const remoteType = inferType();

	instance.registerRemotes([
		{
			name: opts.name,
			entry: opts.entry,
			type: remoteType,
		},
	]);
}

export async function loadRemoteModule<T>(specifier: string): Promise<T> {
	const instance = getFederationInstance();

	const isServer = typeof window === "undefined";
	if (isServer) {
		await (instance as any).initializeSharing?.("default");
	}

	const mod = await instance.loadRemote<T>(specifier);
	if (!mod) {
		throw new Error(`Failed to load remote module: ${specifier}`);
	}
	return mod;
}

export async function ensureNodeRuntimePlugin(): Promise<void> {
	const instance = getFederationInstance();
	if (typeof window !== "undefined") return;
	if ((instance as any).__nodeRuntimePluginLoaded) return;

	const mod: any = await import("@module-federation/node/runtimePlugin");
	const factory = mod?.default ?? mod;
	const plugin = typeof factory === "function" ? factory() : null;
	if (plugin) {
		instance.registerPlugins([plugin]);
	}
	(instance as any).__nodeRuntimePluginLoaded = true;
}
