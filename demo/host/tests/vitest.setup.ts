import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SERVER_INFO_PATH = path.resolve(__dirname, "../.vitest-ui-server.json");

if (!process.env.BOS_UI_URL || !process.env.BOS_UI_SSR_URL) {
	if (!existsSync(SERVER_INFO_PATH)) {
		throw new Error(
			`Missing UI test server info file at ${SERVER_INFO_PATH}. ` +
				"Expected vitest globalSetup to create it.",
		);
	}

	const raw = readFileSync(SERVER_INFO_PATH, "utf8");
	const parsed = JSON.parse(raw) as { baseUrl?: string };
	if (!parsed.baseUrl) {
		throw new Error(`Invalid UI test server info in ${SERVER_INFO_PATH}`);
	}

	process.env.BOS_UI_URL = parsed.baseUrl;
	process.env.BOS_UI_SSR_URL = parsed.baseUrl;
}
