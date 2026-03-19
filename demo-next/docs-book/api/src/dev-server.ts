import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const docs = [
	{
		slug: "intro",
		title: "Introduction",
		body: "# Introduction\n\nWelcome to the Docs Book!\n\nThis is a simple documentation system built with everything-dev-next.",
	},
	{
		slug: "getting-started",
		title: "Getting Started",
		body: "# Getting Started\n\n## Installation\n\n```bash\nnpm install everything-dev-next\n```\n\n## Usage\n\nCreate a bos.config.json and run:\n\n```bash\nnpx everything-dev-next dev\n```",
	},
	{
		slug: "architecture",
		title: "Architecture",
		body: "# Architecture\n\n## Components\n\n- **Host**: Server that orchestrates UI and API\n- **UI**: Remote UI module loaded via Module Federation\n- **API**: Remote API plugin loaded via Module Federation\n\n## Module Federation\n\nAll remotes use mf-manifest.json for discovery.",
	},
];

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", "http://localhost");

	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	if (url.pathname === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	if (url.pathname === "/docs") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				docs: docs.map((d) => ({ slug: d.slug, title: d.title })),
			}),
		);
		return;
	}

	const docMatch = url.pathname.match(/^\/docs\/([^/]+)$/);
	if (docMatch) {
		const slug = docMatch[1];
		const doc = docs.find((d) => d.slug === slug);
		if (doc) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(doc));
			return;
		}
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Doc not found" }));
		return;
	}

	if (
		url.pathname === "/remoteEntry.js" ||
		url.pathname === "/mf-manifest.json"
	) {
		try {
			const distPath = join(__dirname, "../dist");
			const filePath = join(distPath, url.pathname.slice(1));
			const content = await readFile(filePath);
			res.writeHead(200, { "Content-Type": "application/javascript" });
			res.end(content);
			return;
		} catch {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
	}

	res.writeHead(404);
	res.end("Not found");
});

const port = Number(process.env.PORT) || 3014;
server.listen(port, () => {
	console.log(`API dev server running at http://localhost:${port}`);
});
