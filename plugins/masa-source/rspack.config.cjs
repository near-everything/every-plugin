const path = require("path");
const { rspack } = require("@rspack/core");

const pkg = require("./package.json");

// Helper to get normalized remote name
function getNormalizedRemoteName(name) {
  return name.replace(/[@\/]/g, "_").replace(/-/g, "_");
}

function getPluginInfo() {
  return {
    name: pkg.name,
    version: pkg.version,
    normalizedName: getNormalizedRemoteName(pkg.name),
    dependencies: pkg.dependencies || {},
    peerDependencies: pkg.peerDependencies || {},
  };
}

const pluginInfo = getPluginInfo();

module.exports = {
  entry: "./src/index",
  mode: process.env.NODE_ENV === "development" ? "development" : "production",
  target: "async-node",
  devtool: "source-map",
  output: {
    uniqueName: pluginInfo.normalizedName,
    publicPath: "auto",
    path: path.resolve(__dirname, "dist"),
    clean: true,
    library: { type: "commonjs-module" },
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    hot: true,
    port: 3013,
    devMiddleware: {
      writeToDisk: true,
    },
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
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new rspack.container.ModuleFederationPlugin({
      name: pluginInfo.normalizedName,
      filename: "remoteEntry.js",
      runtimePlugins: [
        require.resolve("@module-federation/node/runtimePlugin"),
      ],
      library: { type: "commonjs-module" },
      exposes: {
        "./plugin": "./src/index.ts",
      },
      shared: {
        effect: {
          singleton: true,
          requiredVersion: false,
          eager: true,
          strictVersion: false,
          version: false,
        },
        zod: {
          singleton: true,
          requiredVersion: false,
          eager: true,
          strictVersion: false,
          version: false,
        },
        "@orpc/contract": {
          singleton: true,
          requiredVersion: false,
          eager: true,
          strictVersion: false,
          version: false,
        },
        "@orpc/server": {
          singleton: true,
          requiredVersion: false,
          eager: true,
          strictVersion: false,
          version: false,
        },
      },
    }),
  ],
};
