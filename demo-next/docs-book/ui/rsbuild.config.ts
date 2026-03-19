import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

const require = createRequire(import.meta.url);
const port = Number(process.env.PORT) || 3002;
const remoteOrigin = `http://localhost:${port}`;

// The Module Federation rsbuild plugin writes merged mf-manifest/mf-stats to disk.
// Ensure the output directories exist to avoid ENOENT in dev.
fs.mkdirSync(path.resolve(process.cwd(), "dist"), { recursive: true });
fs.mkdirSync(path.resolve(process.cwd(), "dist", "ssr"), { recursive: true });

const sharedForWeb = {
	react: {
		singleton: true,
		requiredVersion: false,
	},
	"react-dom": {
		singleton: true,
		requiredVersion: false,
	},
};

const sharedForNode = {
	react: {
		import: false,
		singleton: true,
		requiredVersion: false,
	},
	"react-dom": {
		import: false,
		singleton: true,
		requiredVersion: false,
	},
};

export default defineConfig({
	plugins: [
		pluginReact(),
		pluginModuleFederation(
			{
				name: "ui",
				filename: "remoteEntry.js",
				dts: false,
				exposes: {
					"./App": "./src/App.tsx",
					"./render": "./src/render.tsx",
				},
				experiments: {
					asyncStartup: true,
				},
				shared: sharedForWeb,
			},
			{
				environment: "mf",
			},
		),
		pluginModuleFederation(
			{
				name: "ui",
				filename: "remoteEntry.js",
				dts: false,
				library: {
					type: "commonjs-module",
				},
				remoteType: "script",
				exposes: {
					"./App": "./src/App.tsx",
					"./render": "./src/render.tsx",
				},
				experiments: {
					asyncStartup: true,
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
	],
	server: {
		port,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	},
	environments: {
		mf: {
			output: {
				distPath: { root: "dist" },
				assetPrefix: `${remoteOrigin}/`,
			},
			tools: {
				rspack: (config) => {
					config.target = "web";
					config.output ||= {};
					config.output.globalObject = "globalThis";
					// Ensure browser-compatible chunk loading.
					(config.output as any).chunkFormat = "array-push";
					(config.output as any).chunkLoading = "jsonp";
					return config;
				},
			},
		},
		"mf-ssr": {
			source: {
				entry: {},
			},
			output: {
				assetPrefix: `${remoteOrigin}/ssr/`,
				cleanDistPath: false,
				distPath: {
					root: "dist/ssr",
				},
			},
			tools: {
				rspack: (config) => {
					config.target = "async-node";
					config.output ||= {};
					(config.output as any).chunkFormat = "commonjs";
					(config.output as any).chunkLoading = "async-node";
					config.output.library = { type: "commonjs-module" } as any;
					return config;
				},
			},
		},
	},
});
