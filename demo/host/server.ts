import "dotenv/config";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { handleApiRequest } from "./src/server/api";

const require = createRequire(import.meta.url);

const configJson = process.env.BOS_RUNTIME_CONFIG;

if (!configJson) {
	console.error(`
╔═══════════════════════════════════════════════════════════════════╗
║  BOS_RUNTIME_CONFIG environment variable is required.             ║
║                                                                   ║
║  The host must be started through the BOS CLI:                    ║
║    bos dev                  # Full local development              ║
║    bos dev --host=local     # Local host with remote UI/API       ║
║    bos start                # Production mode                     ║
║                                                                   ║
║  Direct 'bun run dev' is not supported.                           ║
╚═══════════════════════════════════════════════════════════════════╝
`);
	process.exit(1);
}

try {
	JSON.parse(configJson);
} catch (e) {
	console.error("Failed to parse BOS_RUNTIME_CONFIG:", e);
	process.exit(1);
}

async function loadStartFetch(): Promise<(req: Request) => Promise<Response>> {
	if (!globalThis.self) {
		(globalThis as any).self = globalThis;
	}

	// TanStack Start's server bundle is emitted as CJS, but this package is ESM.
	// Copy to .cjs so Node can `require()` it.
	const bundledServerPath = path.resolve("./dist/server/server.js");
	const commonJsServerPath = path.resolve("./dist/server/server.cjs");
	fs.copyFileSync(bundledServerPath, commonJsServerPath);

	let imported: any = require(commonJsServerPath);
	if (imported && typeof imported.then === "function") {
		imported = await imported;
	}

	const entry = imported?.default ?? imported;
	const fetchHandler = entry?.fetch;

	if (typeof fetchHandler !== "function") {
		throw new Error(
			`TanStack Start server entry did not export a fetch handler (expected default.fetch): ${bundledServerPath}`,
		);
	}

	return fetchHandler;
}

async function main() {
	const port = Number(process.env.PORT) || 3000;
	const hostname = process.env.HOST || "0.0.0.0";

	const startFetch = await loadStartFetch();

	// Serve built client assets + delegate everything else to Start.
	const app = new Hono();

	app.use("/static/*", serveStatic({ root: "./dist/client" }));
	app.use("/favicon.ico", serveStatic({ root: "./dist/client" }));
	app.use("/icon.svg", serveStatic({ root: "./dist/client" }));
	app.use("/manifest.json", serveStatic({ root: "./dist/client" }));
	app.use("/robots.txt", serveStatic({ root: "./dist/client" }));

	app.all("/api/*", (c) => handleApiRequest(c.req.raw));
	app.all("*", (c) => startFetch(c.req.raw));

	serve({ fetch: app.fetch, port, hostname }, (info) => {
		console.log(`Host server running at http://${hostname}:${info.port}`);
	});
}

main().catch((e) => {
	console.error("Failed to start TanStack Start server:", e);
	process.exit(1);
});
