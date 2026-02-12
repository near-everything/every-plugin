import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { formatORPCError } from "every-plugin/errors";
import { onError } from "every-plugin/orpc";
import { proxyRequest } from "@/server/proxy";
import { getServerServices } from "@/server/runtime";
import { createRequestContext } from "@/services/context";
import { createRouter } from "@/services/router";

export const Route = createFileRoute("/api/rpc/$")({
	server: {
		handlers: {
			ANY: async ({ request }) => {
				const { config, auth, db, plugins } = await getServerServices();

				if (config.api.proxy) {
					return proxyRequest(request, config.api.proxy, true);
				}

				const router = createRouter(plugins);
				const handler = new RPCHandler(router, {
					interceptors: [
						onError((error: unknown) => {
							formatORPCError(error);
							throw error;
						}),
					],
				});

				const context = await createRequestContext(request, auth, db);
				const { response } = await handler.handle(request, {
					prefix: "/api/rpc",
					context,
				});

				return response ?? new Response("Not Found", { status: 404 });
			},
		},
	},
});
