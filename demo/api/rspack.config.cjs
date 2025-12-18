const fs = require("node:fs");
const path = require("node:path");
const { EveryPluginDevServer } = require("every-plugin/build/rspack");
const { withZephyr } = require("zephyr-rspack-plugin");
const pkg = require("./package.json");

const isProduction = process.env.NODE_ENV === 'production';

function updateHostConfig(name, url) {
  try {
    const configPath = path.resolve(__dirname, "../bos.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (config.app.api.name !== name) {
      console.error(`   ❌ API "${name}" not found in bos.config.json`);
      return;
    }

    config.app.api.production = url;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`   ✅ Updated bos.config.json: app.api.production`);
  } catch (err) {
    console.error("   ❌ Failed to update bos.config.json:", err.message);
  }
}

const baseConfig = {
  externals: [
    /^@libsql\/.*/, 
  ],
  plugins: [new EveryPluginDevServer()],
  infrastructureLogging: {
    level: 'error',
  },
  stats: 'errors-warnings',
};

module.exports = isProduction
  ? withZephyr({
      hooks: {
        onDeployComplete: (info) => {
          console.log("🚀 API Deployed:", info.url);
          updateHostConfig(pkg.name, info.url);
        },
      },
    })(baseConfig)
  : baseConfig;
