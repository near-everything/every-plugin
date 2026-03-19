import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "everything-dev-next/config";
import { createHostServer } from "everything-dev-next/host";
import { syncAndGenerateSharedUi } from "everything-dev-next/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
	const env =
		process.env.NODE_ENV === "production" ? "production" : "development";
	const command = process.argv[2] ?? "dev";

	console.log(`[Host] Starting in ${env} mode`);
	console.log(`[Host] Command: ${command}`);

	const result = await loadConfig({ env });

	if (!result) {
		console.error("[Host] No bos.config.json found");
		process.exit(1);
	}

	console.log(`[Host] Config loaded from: ${result.source.path}`);
	console.log(`[Host] Account: ${result.config.account}`);
	console.log(`[Host] UI URL: ${result.runtime.ui?.url ?? "not configured"}`);
	console.log(`[Host] API URL: ${result.runtime.api?.url ?? "not configured"}`);

	const configDir = dirname(result.source.path);

	await syncAndGenerateSharedUi({
		configDir,
		hostMode: env === "development" ? "local" : "remote",
	});

	console.log(`[Host] Shared deps synced`);

	const port = Number(process.env.PORT) || 3000;

	const server = createHostServer({
		runtimeConfig: result.runtime,
		configDir,
		port,
	});

	await server.ready;

	console.log(`[Host] Server ready on port ${port}`);

	process.on("SIGINT", async () => {
		console.log("\n[Host] Shutting down...");
		await server.shutdown();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		await server.shutdown();
		process.exit(0);
	});

	await new Promise(() => {});
}

main().catch((error) => {
	console.error("[Host] Error:", error);
	process.exit(1);
});
