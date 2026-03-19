import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { router } from "./router";

declare global {
	interface Window {
		__RUNTIME_CONFIG__?: any;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

const queryClient = new QueryClient();

router.update({
	history: createBrowserHistory(),
	context: {
		apiUrl: window.__RUNTIME_CONFIG__?.apiUrl ?? "/api",
		queryClient,
	},
});

const root = ReactDOM.createRoot(rootElement);
root.render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</React.StrictMode>,
);
