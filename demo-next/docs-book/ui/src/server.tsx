import { renderToStream } from "@serverize/react/streaming";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

export interface RenderOptions {
	runtimeConfig: {
		env: string;
		account: string;
		hostUrl?: string;
		ui?: { name: string; url: string; entry: string };
		api?: { name: string; url: string; entry: string };
	};
	apiUrl: string;
}

export async function render(request: Request, opts: RenderOptions) {
	const queryClient = new QueryClient();

	const memoryHistory = createMemoryHistory({
		initialEntries: [new URL(request.url).pathname],
	});

	router.update({
		history: memoryHistory,
		context: {
			queryClient,
			apiUrl: opts.apiUrl,
		},
	});

	const stream = await renderToStream(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
		{
			bootstrapModules: [`${opts.runtimeConfig.ui?.url}/remoteEntry.js`],
			runtimeConfig: opts.runtimeConfig,
		},
	);

	return new Response(stream, {
		headers: { "Content-Type": "text/html" },
	});
}

export default { render };
