import { AsyncLocalStorage } from "node:async_hooks";

type Store = {
	apiClient: unknown;
};

const als = new AsyncLocalStorage<Store>();

let overrideClient: unknown | undefined;
let installed = false;

export function installSsrApiClientGlobal(): void {
	if (installed) return;
	installed = true;

	Object.defineProperty(globalThis, "$apiClient", {
		configurable: true,
		enumerable: false,
		get() {
			return als.getStore()?.apiClient ?? overrideClient;
		},
		set(value: unknown) {
			overrideClient = value;
		},
	});
}

export function runWithSsrApiClient<T>(
	apiClient: unknown,
	fn: () => T,
): T {
	return als.run({ apiClient }, fn);
}
