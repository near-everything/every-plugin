const path = require("path");
const { rspack } = require("@rspack/core");

const pkg = require("./package.json");

// Helper to get normalized remote name
function getNormalizedRemoteName(name) {
  return name
    .toLowerCase()
    .replace(/^@/, '')  // Remove leading @
    .replace(/\//g, '_'); // Replace / with _
    // Keep hyphens as-is
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
    port: 3014,
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
        "every-plugin": {
          singleton: true,
          requiredVersion: false,
          strictVersion: false,
        },
        effect: {
          singleton: true,
          requiredVersion: false,
          strictVersion: false,
        },
        zod: {
          singleton: true,
          requiredVersion: false,
          strictVersion: false,
        },
        "@orpc/contract": {
          singleton: true,
          requiredVersion: false,
          strictVersion: false,
        },
        "@orpc/server": {
          singleton: true,
          requiredVersion: false,
          strictVersion: false,
        }
      },
    }),
  ],
};
