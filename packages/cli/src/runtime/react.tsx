import * as React from "react";
import type { HostRuntimeContext } from "./index";

const HostContext = React.createContext<HostRuntimeContext | null>(null);

export function HostContextProvider(props: {
	value: HostRuntimeContext;
	children: React.ReactNode;
}) {
	return (
		<HostContext.Provider value={props.value}>
			{props.children}
		</HostContext.Provider>
	);
}

export function useHostContext(): HostRuntimeContext {
	const ctx = React.useContext(HostContext);
	if (!ctx) throw new Error("Missing HostContextProvider");
	return ctx;
}

export function useRuntimeConfig() {
	return useHostContext().runtimeConfig;
}

export function useAuth() {
	return useHostContext().auth;
}

export function useApiClient<TApiClient = unknown>(): TApiClient {
	return useHostContext().apiClient as TApiClient;
}

export function useQueryClient<TQueryClient = unknown>(): TQueryClient {
	return useHostContext().queryClient as TQueryClient;
}
