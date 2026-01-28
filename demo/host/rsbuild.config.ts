import fs from "node:fs";
import path from "node:path";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import DrizzleORMMigrations from "@proj-airi/unplugin-drizzle-orm-migrations/rspack";
import { withZephyr } from "zephyr-rsbuild-plugin";

const __dirname = import.meta.dirname;
const shouldDeploy = process.env.DEPLOY === "true";

const configPath =
  process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, "../bos.config.json");

function updateBosConfig(url: string) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.app.host.production = url;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated bos.config.json: app.host.production`);
  } catch (err) {
    console.error(
      "   ❌ Failed to update bos.config.json:",
      (err as Error).message
    );
  }
}

const plugins = [pluginReact()];

if (shouldDeploy) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: (info: { url: string }) => {
          console.log("🚀 Host Deployed:", info.url);
          updateBosConfig(info.url);
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
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  dev: {
    progressBar: false,
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
        DrizzleORMMigrations(),
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
