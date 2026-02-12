import { createFileRoute } from "@tanstack/react-router";
import { proxyRequest } from "@/server/proxy";
import { getServerServices } from "@/server/runtime";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			ANY: async ({ request }) => {
				const { config, auth } = await getServerServices();
				if (config.api.proxy) {
					return proxyRequest(request, config.api.proxy, true);
				}
				return auth.handler(request);
			},
		},
	},
});
