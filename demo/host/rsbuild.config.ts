import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import DrizzleORMMigrations from "@proj-airi/unplugin-drizzle-orm-migrations/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";
import { withZephyr } from "zephyr-rsbuild-plugin";

const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname;
const shouldDeploy = process.env.DEPLOY === "true";

const configPath =
	process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, "../bos.config.json");

const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sharedUi = bosConfig.shared?.ui ?? {};

// Prefer MF shared settings that avoid strict version lockstep.
// TanStack Start + MF + workspaces can easily pull multiple copies otherwise.
const mfShared = {
	...sharedUi,
	react: { singleton: true, requiredVersion: false },
	"react-dom": { singleton: true, requiredVersion: false },
	"@tanstack/react-query": { singleton: true, requiredVersion: false },
	"@tanstack/react-router": { singleton: true, requiredVersion: false },
};

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

// Host exposes ./Server for remote loading, but does NOT bake UI remotes
// UI is loaded at runtime from runtimeConfig.ui.url
const plugins = [
	pluginReact(),
	pluginModuleFederation(
		{
			name: "host",
			exposes: {
				"./Server": "./src/program.ts",
			},
			dts: false,
			experiments: {
				asyncStartup: true,
			},
			runtimePlugins: [
				require.resolve("@module-federation/node/runtimePlugin"),
			],
			shared: mfShared,
		},
		{
			environment: "client",
		},
	),
	...tanstackStart(),
];

if (shouldDeploy) {
	plugins.push(
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
	plugins,
	resolve: {
		alias: {
			"@": "./src",
			"~/": "./app/",
		},
	},
	dev: {
		progressBar: false,
	},
	environments: {
		ssr: {
			tools: {
				rspack: {
					target: "async-node",
					output: {
						chunkFormat: "commonjs",
						chunkLoading: "async-node",
						library: {
							type: "commonjs-module",
						},
					},
					infrastructureLogging: {
						level: "error",
					},
					stats: "errors-warnings",
					externals: [
						/^node:/,
						/^bun:/,
						"@libsql/client",
						/^react$/,
						/^react-dom$/,
						/^react-dom\/.*/,
					],
					plugins: [
						DrizzleORMMigrations(),
						// Host SSR exposes ./Server but does NOT declare UI remotes
						// UI is registered at runtime from runtimeConfig.ui.url
						new ModuleFederationPlugin({
							name: "host_ssr",
							exposes: {
								"./Server": "./src/program.ts",
							},
							dts: false,
							experiments: {
								asyncStartup: true,
							},
							remoteType: "script",
							runtimePlugins: [
								require.resolve("@module-federation/node/runtimePlugin"),
							],
							shared: mfShared,
						}),
					],
				},
			},
		},
	},
	output: {
		minify: false,
		distPath: {
			root: "dist",
		},
		assetPrefix: "/",
		filename: {
			js: "[name].js",
		},
	},
});
