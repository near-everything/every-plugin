import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withZephyr } from "zephyr-rsbuild-plugin";
import pkg from "./package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const isProduction = process.env.NODE_ENV === "production";
const buildTarget = process.env.BUILD_TARGET as "client" | "server" | undefined;
const isServerBuild = buildTarget === "server";

const configPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

function updateBosConfig(field: "production" | "ssr", url: string) {
  try {
    const configPath = path.resolve(__dirname, "../bos.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (!config.app.ui) {
      console.error("   ❌ app.ui not found in bos.config.json");
      return;
    }

    config.app.ui[field] = url;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`   ✅ Updated bos.config.json: app.ui.${field}`);
  } catch (err) {
    console.error(
      "   ❌ Failed to update bos.config.json:",
      (err as Error).message
    );
  }
}

const sharedDeps = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@hot-labs/near-connect",
  "near-kit",
] as const;

const sharedConfig = Object.fromEntries(
  sharedDeps.map((dep) => [
    dep,
    {
      singleton: true,
      eager: true,
      requiredVersion: pkg.dependencies[dep],
    },
  ])
);

function createClientConfig() {
  const plugins = [
    pluginReact(),
    pluginModuleFederation({
      name: normalizedName,
      filename: "remoteEntry.js",
      dts: false,
      exposes: {
        "./Router": "./src/router.tsx",
        "./components": "./src/components/index.ts",
        "./providers": "./src/providers/index.tsx",
        "./hooks": "./src/hooks/index.ts",
        "./types": "./src/types/index.ts",
      },
      shared: sharedConfig,
    }),
  ];

  if (isProduction) {
    plugins.push(
      withZephyr({
        hooks: {
          onDeployComplete: (info) => {
            console.log("🚀 UI Client Deployed:", info.url);
            updateBosConfig("production", info.url);
          },
        },
      })
    );
  }

  return defineConfig({
    plugins,
    source: {
      define: {
        "import.meta.env.PUBLIC_ACCOUNT_ID": JSON.stringify(bosConfig.account),
        "import.meta.env.BETTER_AUTH_URL": JSON.stringify(
          bosConfig.app.host[isProduction ? "production" : "development"]
        ),
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
    },
    tools: {
      rspack: {
        target: "web",
        output: {
          uniqueName: normalizedName,
          library: {
            name: normalizedName,
            type: "var",
          },
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
      distPath: { root: "dist" },
      assetPrefix: "auto",
      // assetPrefix: isProduction
      //   ? `${bosConfig.app.ui.production}/`
      //   : `${bosConfig.app.ui.development}/`,
      filename: { css: "static/css/style.css" },
      copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
    },
  });
}

function createServerConfig() {
  const plugins = [pluginReact()];

  if (isProduction) {
    plugins.push(
      withZephyr({
        hooks: {
          onDeployComplete: (info) => {
            console.log("🚀 UI SSR Deployed:", info.url);
            updateBosConfig("ssr", info.url);
          },
        },
      })
    );
  }

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/router.server.tsx",
      },
      define: {
        "import.meta.env.PUBLIC_ACCOUNT_ID": JSON.stringify(bosConfig.account),
        "import.meta.env.BETTER_AUTH_URL": JSON.stringify(
          bosConfig.app.host[isProduction ? "production" : "development"]
        ),
      },
    },
    resolve: {
      alias: {
        "@": "./src",
        "@tanstack/react-devtools": false,
        "@tanstack/react-router-devtools": false,
      },
    },
    tools: {
      rspack: {
        target: "async-node",
        output: {
          uniqueName: `${normalizedName}_server`,
          publicPath: "/",
          library: { type: "commonjs-module" },
        },
        externals: [
          ...sharedDeps,
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/server",
          /^node:/,
        ],
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        plugins: [
          TanStackRouterRspack({ target: "react", autoCodeSplitting: false }),
          new ModuleFederationPlugin({
            name: normalizedName,
            filename: "remoteEntry.server.js",
            dts: false,
            runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
            library: { type: "commonjs-module" },
            exposes: { "./Router": "./src/router.server.tsx" },
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist" },
      assetPrefix: "auto",
      cleanDistPath: false,
    },
  });
}

export default isServerBuild ? createServerConfig() : createClientConfig();
