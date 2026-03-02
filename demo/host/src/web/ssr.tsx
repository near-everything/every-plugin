import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import {
	createRequestHandler,
	RouterServer,
	renderRouterToStream,
} from "@tanstack/react-router/ssr/server";

import type { HostRouterContext } from "./router";
import { createAppRouter } from "./router";

export async function renderToStream(
	request: Request,
	context: HostRouterContext,
) {
	const url = new URL(request.url);
	const history = createMemoryHistory({
		initialEntries: [url.pathname + url.search],
	});

	const router = await createAppRouter({ history, context });

	const handler = createRequestHandler({
		request,
		createRouter: () => router,
	});

	const response = await handler(({ request, responseHeaders, router }) =>
		renderRouterToStream({
			request,
			responseHeaders,
			router,
			children: (
				<QueryClientProvider client={context.queryClient}>
					<RouterServer router={router} />
				</QueryClientProvider>
			),
		}),
	);

	return response;
}
