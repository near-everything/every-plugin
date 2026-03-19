import { EveryPluginDevServer } from "every-plugin/build/rspack";

export default {
	entry: "./src/index.ts",
	mode: process.env.NODE_ENV === "production" ? "production" : "development",
	devtool: "source-map",
	target: "async-node",
	infrastructureLogging: { level: "error" },
	stats: "errors-warnings",
	plugins: [
		new EveryPluginDevServer({
			port: Number(process.env.PORT) || 3014,
		}),
	],
};
