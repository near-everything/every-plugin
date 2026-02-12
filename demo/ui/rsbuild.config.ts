import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { withZephyr } from "zephyr-rsbuild-plugin";
import pkg from "./package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const shouldDeploy = process.env.DEPLOY === "true";
const require = createRequire(import.meta.url);

const bosConfigPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(bosConfigPath, "utf8"));
const uiSharedDeps = bosConfig.shared?.ui ?? {};

// Match the reference examples: avoid strict shared version pinning.
const mfShared = {
	...uiSharedDeps,
	react: { singleton: true, requiredVersion: false },
	"react-dom": { singleton: true, requiredVersion: false },
	"@tanstack/react-query": { singleton: true, requiredVersion: false },
	"@tanstack/react-router": { singleton: true, requiredVersion: false },
};

const uiDevUrl =
	process.env.BOS_UI_URL ??
	bosConfig.app?.ui?.development ??
	"http://localhost:3002";

function updateBosConfig(url: string) {
	try {
		const configPath = path.resolve(__dirname, "../bos.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

		if (!config.app.ui) {
			console.error("   ❌ app.ui not found in bos.config.json");
			return;
		}

		config.app.ui.production = url;
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		console.log(`   ✅ Updated bos.config.json: app.ui.production`);
	} catch (err) {
		console.error(
			"   ❌ Failed to update bos.config.json:",
			(err as Error).message,
		);
	}
}

function createClientConfig() {
	const plugins = [
		pluginReact(),
		pluginModuleFederation({
			name: normalizedName,
			filename: "remoteEntry.js",
			dts: false,
			exposes: {
				"./Routes": "./src/routes.remote.tsx",
				"./components": "./src/components/index.ts",
				"./providers": "./src/providers/index.tsx",
				"./hooks": "./src/hooks/index.ts",
				"./types": "./src/types/index.ts",
			},
			runtimePlugins: [
				require.resolve("@module-federation/node/runtimePlugin"),
			],
			shared: mfShared,
		}),
	];

	if (shouldDeploy) {
		plugins.push(
			withZephyr({
				hooks: {
					onDeployComplete: (info) => {
						console.log("🚀 UI Deployed:", info.url);
						updateBosConfig(info.url);
					},
				},
			}),
		);
	}

	return defineConfig({
		plugins,
		source: {
			entry: {
				index: "./src/app.tsx",
			},
		},
		resolve: {
			alias: {
				"@": "./src",
			},
		},
		dev: {
			lazyCompilation: false,
			progressBar: false,
			client: {
				overlay: false,
			},
		},
		server: {
			port: 3002,
			printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
			publicDir: {
				name: "dist",
				copyOnBuild: false,
			},
		},
		tools: {
			rspack: {
				target: "web",
				output: {
					uniqueName: normalizedName,
				},
				infrastructureLogging: { level: "error" },
				stats: "errors-warnings",
				plugins: [
					TanStackRouterRspack({
						target: "react",
						autoCodeSplitting: true,
					}),
				],
			},
		},
		output: {
			distPath: { root: "dist", css: "static/css", js: "static/js" },
			assetPrefix: "auto",
			filename: { js: "[name].js", css: "style.css" },
			copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
		},
		environments: {
			ssr: {
				source: {
					entry: {},
				},
				output: {
					assetPrefix: `${uiDevUrl}/ssr/`,
					cleanDistPath: false,
					distPath: {
						root: "dist/ssr",
					},
					filename: {
						js: "[name].js",
					},
				},
				tools: {
					rspack: {
						target: "async-node",
						externals: [/^node:/, /^react$/, /^react-dom$/, /^react-dom\/.*/],
						output: {
							chunkFormat: "commonjs",
							chunkLoading: "async-node",
							library: {
								type: "commonjs-module",
							},
						},
						plugins: [
							new ModuleFederationPlugin({
								name: normalizedName,
								filename: "remoteEntry.js",
								library: {
									type: "commonjs-module",
								},
								dts: false,
								exposes: {
									"./Routes": "./src/routes.remote.tsx",
									"./components": "./src/components/index.ts",
									"./providers": "./src/providers/index.tsx",
									"./hooks": "./src/hooks/index.ts",
									"./types": "./src/types/index.ts",
								},
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
	});
}

export default createClientConfig();
