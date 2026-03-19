import { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { DocPage } from "./routes/docs.$slug";
import { IndexPage } from "./routes/index";

export interface RouterContext {
	apiUrl: string;
	queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: IndexPage,
});

const docRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/docs/$slug",
	component: DocPage,
});

const routeTree = rootRoute.addChildren([indexRoute, docRoute]);

export const router = createRouter({
	routeTree,
	context: {
		apiUrl: "/api",
		queryClient: new QueryClient(),
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
