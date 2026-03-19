export function patchManifestFetchForSsrPublicPath(mf: any) {
	if (!mf || !mf.loaderHook?.lifecycle?.fetch?.on) return;
	if (mf.__everythingDevPatchedManifestFetch === true) return;
	mf.__everythingDevPatchedManifestFetch = true;

	// Ensure manifest-based remotes have a usable SSR public path in Node.
	mf.loaderHook.lifecycle.fetch.on((url: unknown, init: unknown) => {
		if (typeof url !== "string" || !url.endsWith("/mf-manifest.json")) {
			return;
		}
		return fetch(url, init as any)
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
