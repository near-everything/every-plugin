import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appRouter } from "../routers";

export const openAPIGenerator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function generateOpenAPISpec() {
	const spec = await openAPIGenerator.generate(appRouter, {
		info: {
			title: "Run Every App API",
			version: "1.0.0",
			description:
				"API for managing workflows, queues, runs, and items in the Run Every App platform",
		},
		servers: [
			{
				url: process.env.API_BASE_URL || "http://localhost:3000",
				description: "Development server",
			},
		],
		// Filter out internal procedures if needed
		filter: ({ contract, path }) => {
			// Include all procedures for now, can be customized later
			return true;
		},
	});

	return spec;
}
