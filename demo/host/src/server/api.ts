import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { formatORPCError } from "every-plugin/errors";
import { onError } from "every-plugin/orpc";
import { proxyRequest } from "@/server/proxy";
import { getServerServices } from "@/server/runtime";
import { createRequestContext } from "@/services/context";
import { createRouter } from "@/services/router";

let rpcHandlerPromise: Promise<RPCHandler<any>> | null = null;
let openApiHandlerPromise: Promise<OpenAPIHandler<any>> | null = null;

async function getHandlers() {
	const { config, auth, db, plugins } = await getServerServices();

	if (!rpcHandlerPromise) {
		rpcHandlerPromise = Promise.resolve().then(() => {
			const router = createRouter(plugins);
			return new RPCHandler(router, {
				plugins: [new BatchHandlerPlugin()],
				interceptors: [
					onError((error: unknown) => {
						formatORPCError(error);
						throw error;
					}),
				],
			});
		});
	}

	if (!openApiHandlerPromise) {
		openApiHandlerPromise = Promise.resolve().then(() => {
			const router = createRouter(plugins);
			return new OpenAPIHandler(router, {
				plugins: [
					new OpenAPIReferencePlugin({
						schemaConverters: [new ZodToJsonSchemaConverter()],
						specGenerateOptions: {
							info: {
								title: "API",
								version: "1.0.0",
							},
							servers: [{ url: `${config.hostUrl}/api` }],
						},
					}),
				],
				interceptors: [
					onError((error: unknown) => {
						formatORPCError(error);
						throw error;
					}),
				],
			});
		});
	}

	return { config, auth, db };
}

export async function handleApiRequest(request: Request): Promise<Response> {
	const { config, auth, db } = await getHandlers();

	if (config.api.proxy) {
		if (new URL(request.url).pathname === "/api/_health") {
			return Response.json({ status: "ok", ssr: "available" });
		}
		return proxyRequest(request, config.api.proxy, true);
	}

	const url = new URL(request.url);

	if (url.pathname === "/api/_health") {
		return Response.json({ status: "ok", ssr: "available" });
	}

	if (url.pathname.startsWith("/api/auth/")) {
		return auth.handler(request);
	}

	if (url.pathname.startsWith("/api/rpc")) {
		const rpcHandler = await rpcHandlerPromise!;
		const context = await createRequestContext(request, auth, db);
		const { response } = await rpcHandler.handle(request, {
			prefix: "/api/rpc",
			context,
		});
		return response ?? new Response("Not Found", { status: 404 });
	}

	const openApiHandler = await openApiHandlerPromise!;
	const context = await createRequestContext(request, auth, db);
	const { response } = await openApiHandler.handle(request, {
		prefix: "/api",
		context,
	});
	return response ?? new Response("Not Found", { status: 404 });
}
