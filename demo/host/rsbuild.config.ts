import fs from "node:fs";
import path from "node:path";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import DrizzleORMMigrations from "@proj-airi/unplugin-drizzle-orm-migrations/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { withZephyr } from "zephyr-rsbuild-plugin";

const __dirname = import.meta.dirname;

const shouldDeploy = process.env.DEPLOY === "true";
const isDev = process.env.NODE_ENV !== "production";

const configPath =
	process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, "../bos.config.json");

const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sharedUi = bosConfig.shared?.ui ?? {};

function updateBosConfig(url: string) {
	try {
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		config.app.host.production = url;
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		console.log(`   ✅ Updated bos.config.json: app.host.production`);
	} catch (err) {
		console.error(
			"   ❌ Failed to update bos.config.json:",
			(err as Error).message,
		);
	}
}

const basePlugins = [pluginReact()];

if (shouldDeploy) {
	basePlugins.push(
		withZephyr({
			hooks: {
				onDeployComplete: (info: { url: string }) => {
					console.log("🚀 Host Deployed:", info.url);
					updateBosConfig(info.url);
				},
			},
		}),
	);
}
export default defineConfig({
	plugins: [
		...basePlugins,
		pluginModuleFederation({
			name: "host",
			filename: "remoteEntry.js",
			dts: false,
			experiments: { asyncStartup: !isDev },
			exposes: {
				"./Server": "./src/exposes/server.ts",
			},
			shared: sharedUi,
		}),
	],
	resolve: {
		alias: {
			"@": "./src",
		},
	},
	dev: {
		progressBar: false,
	},
	environments: {
		mf: {
			resolve: {
				alias: {
					"host/program": "./src/program.stub.ts",
				},
			},
			source: {
				entry: {
					client: "./src/client-entry.tsx",
				},
			},
			output: {
				distPath: {
					root: "dist/client",
					js: "static/js",
					css: "static/css",
				},
				assetPrefix: "/",
				filename: {
					js: "[name].js",
				},
			},
			tools: {
				rspack: {
					target: "web",
					optimization: {
						nodeEnv: false,
					},
					infrastructureLogging: { level: "error" },
					stats: "errors-warnings",
				},
			},
		},
		"mf-ssr": {
			resolve: {
				alias: {
					"host/program": "./src/program.remote.ts",
				},
			},
			source: {
				entry: {
					server: "./src/server-entry.ts",
				},
			},
			output: {
				distPath: {
					root: "dist/server",
					js: "",
				},
				cleanDistPath: false,
				assetPrefix: "/",
				filename: {
					js: "[name].cjs",
				},
			},
			tools: {
				rspack: {
					target: "async-node",
					optimization: {
						nodeEnv: false,
					},
					output: {
						uniqueName: "host",
						library: { type: "commonjs-module" },
						chunkFormat: "commonjs",
						chunkLoading: "async-node",
					},
					externals: [/^node:/, /^bun:/, "@libsql/client"],
					infrastructureLogging: {
						level: "error",
					},
					stats: "errors-warnings",
					plugins: [DrizzleORMMigrations()],
				},
			},
		},
	},
});
