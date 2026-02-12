import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBosConfig } from "everything-dev/config";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadStartServer() {
	if (!globalThis.self) {
		(globalThis as any).self = globalThis;
	}

	const bundledServerPath = path.resolve(
		__dirname,
		"../../dist/server/server.js",
	);
	const commonJsServerPath = path.resolve(
		__dirname,
		"../../dist/server/server.cjs",
	);
	fs.copyFileSync(bundledServerPath, commonJsServerPath);

	let imported: any = require(commonJsServerPath);
	if (imported && typeof imported.then === "function") {
		imported = await imported;
	}
	const server = imported?.default ?? imported;
	return server;
}

describe("TanStack Start Server Entry", () => {
	it("exports a fetch handler", async () => {
		const server = await loadStartServer();
		expect(typeof server.fetch).toBe("function");
	});

	it("renders HTML for /", async () => {
		const cfg = await loadBosConfig();
		const uiUrl = process.env.BOS_UI_URL;
		if (uiUrl) cfg.ui.url = uiUrl;

		process.env.BOS_RUNTIME_CONFIG = JSON.stringify(cfg);

		const server = await loadStartServer();
		const res = await server.fetch(new Request("http://localhost/"));
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("demo.everything");
	});
});
