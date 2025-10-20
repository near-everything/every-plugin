const path = require("node:path");
const { rspack } = require("@rspack/core");
const { withZephyr } = require("zephyr-rspack-plugin");

const pkg = require("./package.json");

const { getNormalizedRemoteName } = require("every-plugin/normalize");

const everyPluginPkg = require("every-plugin/package.json");

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

module.exports = withZephyr({
  hooks: {
      onDeployComplete: (info) => {
        console.log('🚀 Deployment Complete!');
        console.log(`   URL: ${info.url}`);
        console.log(`   Module: ${info.snapshot.uid.app_name}`);
        console.log(`   Build ID: ${info.snapshot.uid.build}`);
        console.log(`   Dependencies: ${info.federatedDependencies.length}`);
        console.log(`   Git: ${info.snapshot.git.branch}@${info.snapshot.git.commit}`);
        console.log(`   CI: ${info.buildStats.context.isCI ? 'Yes' : 'No'}`);
      },
    },
})({
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
          version: everyPluginPkg.version,
          singleton: true,
          requiredVersion: everyPluginPkg.version,
          strictVersion: false,
          eager: false,
        },
        effect: {
          version: everyPluginPkg.dependencies.effect,
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies.effect,
          strictVersion: false,
          eager: false,
        },
        zod: {
          version: everyPluginPkg.dependencies.zod,
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies.zod,
          strictVersion: false,
          eager: false,
        },
        "@orpc/contract": {
          version: everyPluginPkg.dependencies["@orpc/contract"],
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies["@orpc/contract"],
          strictVersion: false,
          eager: false,
        },
        "@orpc/server": {
          version: everyPluginPkg.dependencies["@orpc/server"],
          singleton: true,
          requiredVersion: everyPluginPkg.dependencies["@orpc/server"],
          strictVersion: false,
          eager: false,
        },
      },
    }),
  ],
});
