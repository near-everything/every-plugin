const { EveryPluginDevServer } = require('every-plugin/build/rspack');
const { withZephyr } = require('zephyr-rspack-plugin');

module.exports = withZephyr({
  hooks: {
    onDeployComplete: (info) => {

      console.log('🚀 Deployment Complete!');
      console.log(`   URL: ${info.url}`); // remote URL
      console.log(`   Module: ${info.snapshot.uid.app_name}`);
      console.log(`   Build ID: ${info.snapshot.uid.build}`);
      console.log(`   Dependencies: ${info.federatedDependencies.length}`);
      console.log(`   Git: ${info.snapshot.git.branch}@${info.snapshot.git.commit}`);
      console.log(`   CI: ${info.buildStats.context.isCI ? 'Yes' : 'No'}`);
    },
  },
})({
  plugins: [new EveryPluginDevServer()],
});
