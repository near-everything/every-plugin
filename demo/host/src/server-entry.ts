import { runServerBlocking } from "./program";
import type { RuntimeConfig } from "./services/config";

const configJson = process.env.BOS_RUNTIME_CONFIG;

if (!configJson) {
	console.error(`
BOS_RUNTIME_CONFIG environment variable is required.

Start via the BOS CLI:
  bos dev
  bos start
`);
	process.exit(1);
}

let config: RuntimeConfig;
try {
	config = JSON.parse(configJson) as RuntimeConfig;
} catch (e) {
	console.error("Failed to parse BOS_RUNTIME_CONFIG:", e);
	process.exit(1);
}

runServerBlocking({ config }).catch((err) => {
	console.error("Failed to start server:", err);
	process.exit(1);
});
