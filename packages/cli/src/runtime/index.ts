import type { RuntimeConfig } from "everything-dev/types";

export type Role = "user" | "admin" | (string & {});

export type SessionUser = {
	id: string;
	role?: Role;
};

export type SessionSnapshot = {
	user?: SessionUser | null;
} | null;

export type AuthSnapshot = {
	session: SessionSnapshot;
	nearAccountId: string | null;
	role: Role | null;
	isAuthenticated: boolean;
	isAdmin: boolean;
};

export type HostRuntimeContext<TApiClient = unknown, TQueryClient = unknown> = {
	runtimeConfig: RuntimeConfig;
	apiClient: TApiClient;
	queryClient: TQueryClient;
	auth: AuthSnapshot;
	assetsUrl?: string;
};

export type HostBootstrapPayload = {
	runtimeConfig: RuntimeConfig;
	auth: AuthSnapshot;
	assetsUrl?: string;
};
