const { EveryPluginDevServer } = require('@every-plugin/rspack-plugin');

module.exports = {
  plugins: [new EveryPluginDevServer()],
};
