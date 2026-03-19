import type { QueryClient } from "@tanstack/react-query";
import type { HostRuntimeContext } from "everything-dev/runtime";
import * as React from "react";
import type { ApiClient, RuntimeConfig } from "@/types";

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

export function useRuntimeConfig(): RuntimeConfig {
	return useHostContext().runtimeConfig as RuntimeConfig;
}

export function useAuth() {
	return useHostContext().auth;
}

export function useApiClient(): ApiClient;
export function useApiClient<TApiClient = unknown>(): TApiClient;
export function useApiClient<TApiClient = unknown>(): TApiClient {
	return useHostContext().apiClient as TApiClient;
}

export function useQueryClient(): QueryClient {
	return useHostContext().queryClient as QueryClient;
}
