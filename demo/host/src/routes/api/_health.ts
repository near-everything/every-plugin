import { createFileRoute } from "@tanstack/react-router";
import { getServerServices } from "@/server/runtime";

export const Route = createFileRoute("/api/_health")({
	server: {
		handlers: {
			GET: async () => {
				const { config } = await getServerServices();
				return Response.json({
					status: "ok",
					env: config.env,
					ssr: "available",
				});
			},
		},
	},
});
