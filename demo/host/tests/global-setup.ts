import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import path from "node:path";

const SERVER_INFO_PATH = path.resolve(__dirname, "../.vitest-ui-server.json");

function contentTypeFor(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case ".js":
		case ".mjs":
			return "application/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".json":
		case ".map":
			return "application/json; charset=utf-8";
		case ".html":
			return "text/html; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".ico":
			return "image/x-icon";
		case ".txt":
			return "text/plain; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

function safeResolve(distDir: string, urlPath: string): string {
	// Strip query/hash and decode.
	const pathname = urlPath.split("?")[0].split("#")[0];
	const decoded = decodeURIComponent(pathname);
	const rel = decoded.replace(/^\/+/, "");
	const resolved = path.resolve(distDir, rel);

	// Prevent path traversal.
	const distResolved = path.resolve(distDir) + path.sep;
	if (!resolved.startsWith(distResolved)) {
		throw new Error(`Path traversal blocked: ${decoded}`);
	}

	return resolved;
}

function ensureUiBuild(uiDir: string) {
	const distDir = path.join(uiDir, "dist");
	mkdirSync(distDir, { recursive: true });

	const clientEntry = path.join(distDir, "remoteEntry.js");
	const ssrEntry = path.join(distDir, "remoteEntry.server.js");

	const hasClient = existsSync(clientEntry) && statSync(clientEntry).size > 0;
	const hasSsr = existsSync(ssrEntry) && statSync(ssrEntry).size > 0;

	if (hasClient && hasSsr) return;

	// Build both client + server so both remoteEntry files exist.
	const result = spawnSync("bun", ["run", "build"], {
		cwd: uiDir,
		stdio: "inherit",
		env: { ...process.env },
	});
	if (result.status !== 0) {
		throw new Error(`UI build failed (exit ${result.status ?? "unknown"})`);
	}
}

function handlerFactory(distDir: string) {
	return (req: IncomingMessage, res: ServerResponse) => {
		try {
			if (!req.url) {
				res.statusCode = 400;
				res.end("Bad Request");
				return;
			}

			let filePath = safeResolve(distDir, req.url);
			if (existsSync(filePath) && statSync(filePath).isDirectory()) {
				filePath = path.join(filePath, "index.html");
			}
			if (!existsSync(filePath) || !statSync(filePath).isFile()) {
				res.statusCode = 404;
				res.end("Not Found");
				return;
			}

			const buf = readFileSync(filePath);
			res.statusCode = 200;
			res.setHeader("content-type", contentTypeFor(filePath));
			res.setHeader("cache-control", "no-store");
			res.end(buf);
		} catch (e) {
			res.statusCode = 500;
			res.end(String((e as Error).message ?? e));
		}
	};
}

export default async function globalSetup() {
	const repoRoot = path.resolve(__dirname, "../../..");
	const uiDir = path.join(repoRoot, "demo", "ui");
	const distDir = path.join(uiDir, "dist");

	ensureUiBuild(uiDir);

	const server = createServer(handlerFactory(distDir));

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const addr = server.address();
	if (!addr || typeof addr === "string") {
		throw new Error("Failed to bind UI static server");
	}

	const baseUrl = `http://127.0.0.1:${addr.port}`;

	// Point both the client assets and SSR remoteEntry at the same local server.
	process.env.BOS_UI_URL = baseUrl;
	process.env.BOS_UI_SSR_URL = baseUrl;

	// Communicate the chosen URL to worker threads.
	// Vitest worker threads may not observe process.env mutations from globalSetup.
	writeFileSync(SERVER_INFO_PATH, `${JSON.stringify({ baseUrl })}\n`, "utf8");

	return async () => {
		try {
			unlinkSync(SERVER_INFO_PATH);
		} catch {
			// ignore
		}
		await new Promise<void>((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		});
	};
}
