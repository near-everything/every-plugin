import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import React from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router";

interface RenderOptions {
	apiUrl?: string;
	hostUrl?: string;
}

export function render(container: HTMLElement, options: RenderOptions = {}) {
	const queryClient = new QueryClient();
	router.update({
		history: createBrowserHistory(),
		context: {
			apiUrl: options.apiUrl ?? "/api",
			queryClient,
		},
	});

	const root = createRoot(container);
	root.render(
		<React.StrictMode>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</React.StrictMode>,
	);
	return () => root.unmount();
}
