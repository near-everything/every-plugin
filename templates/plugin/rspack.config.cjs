const path = require("path");
const { rspack } = require("@rspack/core");
const pkg = require("./package.json");
const { getNormalizedRemoteName } = require("@curatedotfun/utils");

module.exports = {
  entry: "./src/index",
  mode: process.env.NODE_ENV === "development" ? "development" : "production",
  target: "async-node",
  devtool: "source-map",
  output: {
    uniqueName: getNormalizedRemoteName(pkg.name),
    publicPath: "auto",
    path: path.resolve(__dirname, "dist"),
    clean: true,
    library: { type: "commonjs-module" },
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    hot: true,
    port: 3000, // CHANGE THIS PORT - Use unique port for your plugin
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
      name: getNormalizedRemoteName(pkg.name),
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
          requiredVersion: "^3.17.6",
          eager: false,
        },
        zod: {
          singleton: true,
          requiredVersion: "^4.0.8",
          eager: false,
        },
      },
    }),
  ],
};
