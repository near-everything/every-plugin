import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import type {
	ShareArgs,
	SharedGetter,
	UserOptions,
} from "@module-federation/runtime-core/types";
import { patchManifestFetchForSsrPublicPath } from "everything-dev/mf";
import type { SharedConfig } from "../services/config";

type FederationInstance = ReturnType<typeof createInstance>;

let mf: FederationInstance | null = null;
let registeredUiEntry: string | null = null;
let registeredSharedFingerprint: string | null = null;
let didRegisterNodeRuntimePlugin = false;

const SHARED_ALLOWLIST = [
	"react",
	"react-dom",
	"@tanstack/react-router",
	"@tanstack/react-query",
] as const;

type SharedUiConfig = Record<string, SharedConfig>;

function pickSharedAllowlist(
	shared: SharedUiConfig | undefined,
): SharedUiConfig {
	if (!shared) return {};

	const out: SharedUiConfig = {};
	for (const key of SHARED_ALLOWLIST) {
		if (key in shared) out[key] = shared[key]!;
	}
	return out;
}

function stableFingerprint(shared: SharedUiConfig): string {
	const entries = Object.entries(shared)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => [k, v ?? null]);
	return JSON.stringify(entries);
}

function makeSharedGetter(pkgName: string): SharedGetter | null {
	// IMPORTANT: keep specifier a string literal for bundlers.
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

function toMfSharedUserOptions(
	sharedUi: SharedUiConfig,
): NonNullable<UserOptions["shared"]> {
	const out: NonNullable<UserOptions["shared"]> = {};
	for (const [pkgName, cfg] of Object.entries(sharedUi)) {
		const get = makeSharedGetter(pkgName);
		if (!get) continue;
		if (!cfg.version) continue;

		const shareArgs: ShareArgs = {
			version: cfg.version,
			scope: cfg.shareScope ?? "default",
			shareConfig: {
				requiredVersion: cfg.requiredVersion ?? `^${cfg.version}`,
				singleton: cfg.singleton ?? false,
				eager: cfg.eager ?? false,
				strictVersion: cfg.strictVersion ?? false,
			},
			get,
		};
		out[pkgName] = shareArgs;
	}
	return out;
}

async function ensureNodeRuntimePlugin(instance: FederationInstance) {
	if (didRegisterNodeRuntimePlugin) return;
	if (typeof window !== "undefined") return;

	const mod: any = await import("@module-federation/node/runtimePlugin");
	const factory = mod?.default ?? mod;
	const plugin = typeof factory === "function" ? factory() : null;
	if (plugin) {
		instance.registerPlugins([plugin]);
	}
	// Even if plugin is null, avoid repeated imports.
	didRegisterNodeRuntimePlugin = true;
}

function ensureSharedRegistered(
	instance: FederationInstance,
	sharedUi: SharedUiConfig | undefined,
) {
	const picked = pickSharedAllowlist(sharedUi);
	const fingerprint = stableFingerprint(picked);
	if (registeredSharedFingerprint === fingerprint) return;

	registeredSharedFingerprint = fingerprint;

	const shared = toMfSharedUserOptions(picked);

	// In dev/hot-reload flows it's possible for a shareScope key to exist
	// without the expected version entries, which later makes loadShare()
	// fall back to an undefined local getter (import:false) and crash.
	// Force a clean re-register for our host-owned shared set.
	try {
		const scopeMap = (instance as any).shareScopeMap as Record<
			string,
			Record<string, unknown>
		>;
		for (const [pkgName, shareArgs] of Object.entries(shared)) {
			const scopes = Array.isArray((shareArgs as any).scope)
				? ((shareArgs as any).scope as string[])
				: [((shareArgs as any).scope as string | undefined) ?? "default"];
			for (const sc of scopes) {
				if (scopeMap?.[sc] && pkgName in scopeMap[sc]!) {
					delete (scopeMap[sc] as any)[pkgName];
				}
			}
		}
	} catch {
		// best-effort; shared registration will validate below
	}

	// initOptions updates instance.options.shared (shareInfos) which loadShare() uses.
	instance.initOptions({
		name: "host",
		remotes: ((instance as any).options?.remotes as any[]) ?? [],
		shared,
	});

	// Validate host-owned shared are registered with getters.
	for (const [pkgName, shareArgs] of Object.entries(shared)) {
		const version = (shareArgs as any).version as string | undefined;
		const scope = ((shareArgs as any).scope as string | undefined) ?? "default";
		if (!version) {
			throw new Error(
				`Host shared '${pkgName}' not registered correctly (scope=${scope}, version=?, get=unknown)`,
			);
		}
		const entry = (instance as any).shareScopeMap?.[scope]?.[pkgName]?.[
			version
		];
		const getType = typeof entry?.get;
		if (!version || getType !== "function") {
			throw new Error(
				`Host shared '${pkgName}' not registered correctly (scope=${scope}, version=${version ?? "?"}, get=${getType})`,
			);
		}
	}
}

function getMfInstance(): FederationInstance {
	if (mf) return mf;

	const existing = getInstance();
	if (existing) {
		mf = existing as FederationInstance;
		setGlobalFederationInstance(mf as any);
		patchManifestFetchForSsrPublicPath(mf);
		return mf;
	}

	mf = createInstance({ name: "host", remotes: [] }) as FederationInstance;
	setGlobalFederationInstance(mf as any);
	patchManifestFetchForSsrPublicPath(mf);
	return mf;
}

export async function loadFederatedModule<T>(opts: {
	remoteName: string;
	entry: string;
	module: string;
	shared?: SharedUiConfig;
}): Promise<T> {
	const instance = getMfInstance();
	ensureSharedRegistered(instance, opts.shared);
	await ensureNodeRuntimePlugin(instance);

	// Align with webpack MF invariant: the share scope must be initialized
	// before any container init/get happens (especially when remotes set
	// import:false for host-owned shared like react/react-dom).
	if (typeof window === "undefined") {
		await (instance as any).initializeSharing?.("default");
	}

	const isServer = typeof window === "undefined";
	if (opts.remoteName === "ui") {
		if (registeredUiEntry !== opts.entry) {
			registeredUiEntry = opts.entry;
			instance.registerRemotes([
				{
					name: "ui",
					entry: opts.entry,
					...(isServer ? { type: "script" as const } : {}),
				},
			]);
		}
	} else {
		instance.registerRemotes([
			{
				name: opts.remoteName,
				entry: opts.entry,
				...(isServer ? { type: "script" as const } : {}),
			},
		]);
	}

	const mod = (await instance.loadRemote<T | null>(
		`${opts.remoteName}/${opts.module}`,
	)) as T | null;
	if (!mod) {
		throw new Error(
			`Failed to load federated module ${opts.remoteName}/${opts.module}`,
		);
	}
	return mod;
}
