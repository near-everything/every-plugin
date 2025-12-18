import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";
import { withZephyr } from "zephyr-rsbuild-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const isProduction = process.env.NODE_ENV === "production";

const configPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

function updateHostConfig(_name: string, url: string) {
  try {
    const configPath = path.resolve(__dirname, "../bos.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (!config.app.ui) {
      console.error("   ❌ app.ui not found in bos.config.json");
      return;
    }

    config.app.ui.production = url;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log("   ✅ Updated bos.config.json: app.ui.production");
  } catch (err) {
    console.error(
      "   ❌ Failed to update bos.config.json:",
      (err as Error).message
    );
  }
}

const plugins = [
  pluginReact(),
  pluginModuleFederation({
    name: normalizedName,
    filename: "remoteEntry.js",
    dts: false,
    exposes: {
      "./App": "./src/bootstrap.tsx",
      "./Router": "./src/router.tsx",
      "./components": "./src/components/index.ts",
      "./providers": "./src/providers/index.tsx",
      "./types": "./src/types/index.ts",
    },
    shared: {
      react: {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies.react,
      },
      "react-dom": {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies["react-dom"],
      },
      "@tanstack/react-query": {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies["@tanstack/react-query"],
      },
      "@tanstack/react-router": {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies["@tanstack/react-router"],
      },
      "@hot-labs/near-connect": {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies["@hot-labs/near-connect"],
      },
      "near-kit": {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies["near-kit"],
      },
    },
  }),
];

if (isProduction) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: (info) => {
          console.log("🚀 UI Deployed:", info.url);
          updateHostConfig(normalizedName, info.url);
        },
      },
    })
  );
}

export default defineConfig({
  plugins,
  source: {
    define: {
      "process.env.PUBLIC_ACCOUNT_ID": JSON.stringify(bosConfig.account),
    },
    entry: {
      index: "./src/main.tsx",
      remote: "./src/remote.tsx",
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  html: {
    template: "./index.html",
    templateParameters: {
      title: bosConfig.app.host.title,
      description: bosConfig.app.host.description,
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
        library: {
          name: normalizedName,
          type: "var",
        },
      },
      externalsType: "module",
      externals: {
        fs: "commonjs fs",
        path: "commonjs path",
        crypto: "commonjs crypto",
        "node:fs": "commonjs node:fs",
        "node:fs/promises": "commonjs node:fs/promises",
        "node:path": "commonjs node:path",
        "node:crypto": "commonjs node:crypto",
      },
      infrastructureLogging: {
        level: "error",
      },
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
    assetPrefix: "auto",
    filename: {
      css: "static/css/[name].css",
    },
    copy: [
      {
        from: path.resolve(__dirname, "public"),
        to: "./",
      },
    ],
  },
});
