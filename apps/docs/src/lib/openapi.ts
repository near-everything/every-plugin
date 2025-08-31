import { createOpenAPI } from "fumadocs-openapi/server";

export const openapi = createOpenAPI({
	// Point to the live OpenAPI spec endpoint from the runner app
	input: [
		process.env.RUNNER_API_URL
			? `${process.env.RUNNER_API_URL}/spec.json`
			: "http://localhost:3000/spec.json",
	],
});
