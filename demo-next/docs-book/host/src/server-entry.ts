import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath =
	process.env.BOS_CONFIG_PATH ?? join(__dirname, "../bos.config.json");
const config = JSON.parse(await readFile(configPath, "utf-8"));

const env =
	process.env.NODE_ENV === "production" ? "production" : "development";
const hostUrl = config.app.host[env];
const uiUrl = config.app.ui?.[env] ?? "";
const apiUrl = config.app.api?.[env] ?? "";

const uiRemoteUrl = process.env.UI_REMOTE_URL ?? uiUrl;
const apiRemoteUrl = process.env.API_REMOTE_URL ?? apiUrl;

const app = new Hono();

app.use(
	"*",
	cors({
		origin: [hostUrl, uiRemoteUrl, apiRemoteUrl].filter(Boolean),
		credentials: true,
	}),
);

app.get("/health", (c) => c.text("OK"));

app.get("/api/_health", (c) =>
	c.json({
		status: "ready",
		mode: env,
		ui: uiRemoteUrl,
		api: apiRemoteUrl,
	}),
);

app.all("/api/*", async (c) => {
	const path = c.req.path.replace("/api", "");
	const targetUrl = `${apiRemoteUrl}${path}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`;

	const res = await fetch(targetUrl, {
		method: c.req.method,
		headers: c.req.raw.headers,
		body:
			c.req.method !== "GET" && c.req.method !== "HEAD"
				? await c.req.raw.clone().text()
				: undefined,
	});

	return new Response(res.body, {
		status: res.status,
		headers: res.headers,
	});
});

app.all("/__mf/ui/*", async (c) => {
	const path = c.req.path.replace("/__mf/ui", "");
	const targetUrl = `${uiRemoteUrl}${path}`;

	const res = await fetch(targetUrl, {
		headers: c.req.raw.headers,
	});

	return new Response(res.body, {
		status: res.status,
		headers: res.headers,
	});
});

app.get("*", async (c) => {
	const htmlPath = join(__dirname, "../dist/client/index.html");

	if (existsSync(htmlPath)) {
		const html = await readFile(htmlPath, "utf-8");
		return c.html(html);
	}

	return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Docs Book</title>
	<script src="${uiRemoteUrl}/remoteEntry.js"></script>
</head>
<body>
	<div id="root"></div>
	<script type="module">
		const ui = await import("${uiRemoteUrl}/remoteEntry.js");
		await ui.init();
		const { render } = await ui.get("./render");
		render(document.getElementById("root"), {
			apiUrl: "${apiRemoteUrl}",
			hostUrl: "${hostUrl}",
		});
	</script>
</body>
</html>
	`);
});

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Host server running at http://localhost:${info.port}`);
	console.log(`  UI: ${uiRemoteUrl}`);
	console.log(`  API: ${apiRemoteUrl}`);
});
