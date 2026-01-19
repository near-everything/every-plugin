import fs from "node:fs";
import path from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { withZephyr } from "zephyr-rsbuild-plugin";

const __dirname = import.meta.dirname;
const isProduction = process.env.NODE_ENV === "production";

const configPath =
  process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

function updateBosConfig(field: "production" | "remote", url: string) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.app.host[field] = url;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`   ✅ Updated bos.config.json: app.host.${field}`);
  } catch (err) {
    console.error(
      "   ❌ Failed to update bos.config.json:",
      (err as Error).message
    );
  }
}

const plugins = [pluginReact()];

if (isProduction) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: (info: { url: string }) => {
          console.log("🚀 Host Deployed:", info.url);
          updateBosConfig("remote", info.url);
        },
      },
    })
  );
}

export default defineConfig({
  plugins,
  source: {
    entry: {
      index: "./src/program.ts",
    },
    define: {
      "process.env.PUBLIC_ACCOUNT_ID": JSON.stringify(bosConfig.account),
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  dev: {
    progressBar: false,
  },
  server: {
    port: 3001,
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
      },
      externals: [
        /^node:/,
        /^bun:/,
        "@libsql/client",
      ],
      infrastructureLogging: {
        level: "error",
      },
      stats: "errors-warnings",
      plugins: [
        new ModuleFederationPlugin({
          name: "host",
          filename: "remoteEntry.js",
          dts: false,
          runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
          library: { type: "commonjs-module" },
          exposes: {
            "./Server": "./src/program.ts",
          },
        }),
      ],
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
