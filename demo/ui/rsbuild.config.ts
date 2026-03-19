import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { withZephyr } from "zephyr-rsbuild-plugin";
import pkg from "./package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const normalizedName = pkg.name;
const shouldDeploy = process.env.DEPLOY === "true";
const buildKind =
	(process.env.UI_BUILD_KIND as "client" | "ssr" | undefined) ?? "client";

const bosConfigPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(bosConfigPath, "utf8"));

// Prefer generated shared deps (normalized + versioned).
const generatedSharedPath = path.resolve(
	__dirname,
	"../.bos/generated/shared-ui.json",
);
const generatedShared = fs.existsSync(generatedSharedPath)
	? JSON.parse(fs.readFileSync(generatedSharedPath, "utf8"))
	: null;

const uiSharedDeps = generatedShared?.ui?.deps
	? Object.fromEntries(
			Object.entries(generatedShared.ui.deps as Record<string, any>).map(
				([name, dep]) => [
					name,
					{
						requiredVersion: dep.requiredVersion,
						singleton: dep.singleton,
						eager: dep.eager,
						strictVersion: dep.strictVersion,
					},
				],
			),
		)
	: (bosConfig.shared?.ui ?? {});

function updateBosConfig(field: "production" | "ssr", url: string) {
	try {
		const configPath = path.resolve(__dirname, "../bos.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

		if (!config.app.ui) {
			console.error("   ❌ app.ui not found in bos.config.json");
			return;
		}

		config.app.ui[field] = url;
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		console.log(`   ✅ Updated bos.config.json: app.ui.${field}`);
	} catch (err) {
		console.error(
			"   ❌ Failed to update bos.config.json:",
			(err as Error).message,
		);
	}
}

const sharedForWeb = {
	...uiSharedDeps,
};

const sharedForNode = {
	...uiSharedDeps,
	react: {
		...(uiSharedDeps as any).react,
		import: false,
	},
	"react-dom": {
		...(uiSharedDeps as any)["react-dom"],
		import: false,
	},
};

const plugins = [
	pluginReact(),
	pluginModuleFederation(
		{
			name: normalizedName,
			filename: "remoteEntry.js",
			dts: false,
			experiments: { asyncStartup: true },
			exposes: {
				"./Router": "./src/router.tsx",
				"./components": "./src/components/index.ts",
				"./providers": "./src/providers/index.tsx",
				"./hooks": "./src/hooks/index.ts",
				"./types": "./src/types/index.ts",
			},
			shared: sharedForWeb,
		},
		{
			environment: "mf",
		},
	),
	pluginModuleFederation(
		{
			name: normalizedName,
			filename: "remoteEntry.js",
			dts: false,
			experiments: { asyncStartup: true },
			library: { type: "commonjs-module" },
			remoteType: "script",
			exposes: {
				"./Router": "./src/router.tsx",
				"./components": "./src/components/index.ts",
				"./providers": "./src/providers/index.tsx",
				"./hooks": "./src/hooks/index.ts",
				"./types": "./src/types/index.ts",
			},
			runtimePlugins: [
				require.resolve("@module-federation/node/runtimePlugin"),
			],
			shared: sharedForNode,
		},
		{
			target: "node",
			environment: "mf-ssr",
		},
	),
];

if (shouldDeploy) {
	plugins.push(
		withZephyr({
			hooks: {
				onDeployComplete: (info) => {
					if (buildKind === "ssr") {
						console.log("🚀 UI SSR Deployed:", info.url);
						updateBosConfig("ssr", info.url);
						return;
					}
					console.log("🚀 UI Client Deployed:", info.url);
					updateBosConfig("production", info.url);
				},
			},
		}),
	);
}

export default defineConfig({
	plugins,
	dev: {
		lazyCompilation: false,
		progressBar: false,
		client: {
			overlay: false,
		},
	},
	server: {
		port: Number(process.env.PORT) || 3002,
		// Do not serve index.html for missing assets in dev.
		// This avoids MF executing HTML at remoteEntry URLs ("Unexpected token '<'").
		htmlFallback: false,
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
	resolve: {
		alias: {
			"@": "./src",
		},
	},
	environments: {
		mf: {
			...({ server: { base: "/__mf/ui/" } } as any),
			source: {
				entry: {
					index: "./src/remote-dev.ts",
				},
			},
			tools: {
				rspack: {
					target: "web",
					output: {
						uniqueName: normalizedName,
						publicPath: "/__mf/ui/",
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
				assetPrefix: "/__mf/ui/",
				filename: { js: "[name].js", css: "style.css" },
				copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
			},
		},
		"mf-ssr": {
			...({ server: { base: "/__mf/ui/ssr/" } } as any),
			source: {
				entry: {
					index: "./src/remote-dev.ts",
				},
			},
			resolve: {
				alias: {
					"@tanstack/react-devtools": false,
					"@tanstack/react-router-devtools": false,
				},
			},
			tools: {
				rspack: {
					target: "async-node",
					output: {
						uniqueName: `${normalizedName}_server`,
						publicPath: "/__mf/ui/ssr/",
						library: { type: "commonjs-module" },
						chunkFormat: "commonjs",
						chunkLoading: "async-node",
					},
					externals: [/^node:/],
					infrastructureLogging: { level: "error" },
					stats: "errors-warnings",
					plugins: [
						TanStackRouterRspack({
							target: "react",
							autoCodeSplitting: false,
						}),
					],
					optimization: {
						nodeEnv: false,
					},
				},
			},
			output: {
				distPath: { root: "dist/ssr" },
				assetPrefix: "/__mf/ui/ssr/",
				cleanDistPath: false,
			},
		},
	},
});
