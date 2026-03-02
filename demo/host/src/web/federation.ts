import {
	createInstance,
	getInstance,
} from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";

type FederationInstance = ReturnType<typeof createInstance>;

let mf: FederationInstance | null = null;
let registeredUiEntry: string | null = null;
let didPatchManifestFetch = false;

function patchManifestFetch(instance: FederationInstance) {
	if (didPatchManifestFetch) return;
	didPatchManifestFetch = true;

	// Ensure manifest-based remotes have a usable SSR public path in Node.
	instance.loaderHook.lifecycle.fetch.on((url, init) => {
		if (typeof url !== "string" || !url.endsWith("/mf-manifest.json")) {
			return;
		}
		return fetch(url, init)
			.then((res) => res.json())
			.then((json: any) => {
				json.metaData ||= {};
				json.metaData.ssrPublicPath ||= url.replace(
					/\/mf-manifest\.json$/,
					"/",
				);
				return new Response(JSON.stringify(json), {
					headers: { "content-type": "application/json" },
				});
			});
	});
}

function getMfInstance(): FederationInstance {
	if (mf) return mf;

	const existing = getInstance();
	if (existing) {
		mf = existing as FederationInstance;
		patchManifestFetch(mf);
		return mf;
	}

	mf = createInstance({ name: "host", remotes: [] }) as FederationInstance;
	setGlobalFederationInstance(mf as any);
	patchManifestFetch(mf);
	return mf;
}

export async function loadFederatedModule<T>(opts: {
	remoteName: string;
	entry: string;
	module: string;
}): Promise<T> {
	const instance = getMfInstance();

	if (opts.remoteName === "ui") {
		if (registeredUiEntry !== opts.entry) {
			registeredUiEntry = opts.entry;
			instance.registerRemotes([
				{
					name: "ui",
					entry: opts.entry,
				},
			]);
		}
	} else {
		instance.registerRemotes([
			{
				name: opts.remoteName,
				entry: opts.entry,
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
