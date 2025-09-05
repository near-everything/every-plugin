import path from "path";
import { readFileSync, existsSync } from "fs";
import { defineConfig } from "@rsbuild/core";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";

export interface PluginBuildOptions {
  entry?: string;
  outputPath?: string;
  devPort?: number;
  testPort?: number;
  mode?: "development" | "production";
  packageJsonPath?: string;
  enableManifest?: boolean;
  runtimeChunk?: boolean | "single";
  customShared?: Record<string, any>;
}

// Helper to get normalized remote name (similar to @curatedotfun/utils)
function getNormalizedRemoteName(name: string): string {
  return name.replace(/[@\/]/g, "_").replace(/-/g, "_");
}

// Read package.json and extract plugin info
function getPluginInfo(packageJsonPath: string = "./package.json") {
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Package.json not found at ${packageJsonPath}`);
  }
  
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  
  return {
    name: pkg.name,
    version: pkg.version,
    normalizedName: getNormalizedRemoteName(pkg.name),
    dependencies: pkg.dependencies || {},
    peerDependencies: pkg.peerDependencies || {}
  };
}

// Auto-configure shared dependencies from package.json
function getSharedDependencies(packageJsonPath: string = "./package.json", customShared: Record<string, any> = {}) {
  const pluginInfo = getPluginInfo(packageJsonPath);
  const allDeps = { ...pluginInfo.dependencies, ...pluginInfo.peerDependencies };
  
  const shared: Record<string, any> = {};
  
  // Auto-configure common dependencies
  Object.keys(allDeps).forEach(dep => {
    if (dep.startsWith('@types/')) return; // Skip type definitions
    
    shared[dep] = {
      singleton: true,
      requiredVersion: allDeps[dep],
      // Don't eager load by default for better performance
      eager: false,
    };
  });
  
  // Override with our specific requirements
  const coreShared = {
    effect: {
      singleton: true,
      eager: false,
    },
    zod: {
      singleton: true,
      eager: false,
    },
    "@orpc/contract": {
      singleton: true,
      eager: false,
    },
    "@orpc/server": {
      singleton: true,
      eager: false,
    },
    "@module-federation/enhanced": {
      singleton: true,
      eager: false,
    },
    "@module-federation/runtime-core": {
      singleton: true,
      eager: false,
    },
  };
  
  return { ...shared, ...coreShared, ...customShared };
}

// Create rsbuild config for plugin development (modern approach)
export function createPluginConfig(options: PluginBuildOptions = {}) {
  const {
    entry = "./src/index",
    outputPath = "dist",
    devPort = 3000,
    testPort = 3999,
    mode = process.env.NODE_ENV === "development" ? "development" : "production",
    packageJsonPath = "./package.json",
    enableManifest = true,
    runtimeChunk = true,
    customShared = {}
  } = options;

  const pluginInfo = getPluginInfo(packageJsonPath);
  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  const port = isTest ? testPort : devPort;

  return defineConfig({
    source: {
      entry: {
        index: entry,
      },
    },
    output: {
      target: "node",
      distPath: {
        root: outputPath,
      },
    },
    server: {
      port,
    },
    dev: {
      writeToDisk: true,
    },
    mode,
    plugins: [
      pluginModuleFederation({
        name: pluginInfo.normalizedName,
        filename: "remoteEntry.js",
        manifest: enableManifest,
        exposes: {
          "./plugin": "./src/index.ts",
        },
        shared: getSharedDependencies(packageJsonPath, customShared),
        runtimePlugins: [
          require.resolve("@module-federation/enhanced/runtime"),
        ],
      }),
    ],
    performance: {
      chunkSplit: runtimeChunk ? {
        strategy: "split-by-experience",
      } : undefined,
    },
    tools: {
      rspack: {
        resolve: {
          extensions: [".tsx", ".ts", ".js"],
        },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              use: "builtin:swc-loader",
              exclude: /node_modules/,
            },
          ],
        },
      },
    },
  });
}

// Modern rsbuild-based config with Module Federation (recommended)
export function createPluginConfigWithFederation(options: PluginBuildOptions = {}) {
  // This is now just an alias to the main createPluginConfig since it includes MF by default
  return createPluginConfig(options);
}

// Export the modern factory as default
export default createPluginConfigWithFederation;

// Convenience function for simple plugin configs
export function simplePluginConfig(devPort: number = 3000, testPort: number = 3999) {
  return createPluginConfig({ devPort, testPort });
}

// Convenience function for optimized production builds
export function optimizedPluginConfig(options: Omit<PluginBuildOptions, 'mode'> = {}) {
  return createPluginConfig({
    ...options,
    mode: "production",
    runtimeChunk: "single", // Maximum optimization
    enableManifest: true,
  });
}
