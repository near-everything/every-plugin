// ============================================================================
// Auth Client - Types and Placeholder
// ============================================================================
// The actual auth client implementation is provided by the Host via React Context.
// This file provides the type definitions that UI components expect.

export interface Session {
	user: {
		id: string;
		email?: string;
		name?: string;
	} | null;
}

export interface AuthClient {
	signOut: () => Promise<void>;
	near: {
		disconnect: () => Promise<void>;
	};
	getSession: () => Promise<{ data: Session | null }>;
}

// Export a placeholder that will be overridden by the Host's context
export const authClient: AuthClient = {
	signOut: async () => {
		throw new Error(
			"authClient not initialized. Ensure AuthProvider is mounted by the Host.",
		);
	},
	near: {
		disconnect: async () => {
			throw new Error(
				"authClient not initialized. Ensure AuthProvider is mounted by the Host.",
			);
		},
	},
	getSession: async () => {
		throw new Error(
			"authClient not initialized. Ensure AuthProvider is mounted by the Host.",
		);
	},
};
