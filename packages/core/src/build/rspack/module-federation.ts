import type { PluginInfo } from './utils';

export function buildSharedDependencies(pluginInfo: PluginInfo) {
  // Get every-plugin package info for version constraints
  const everyPluginPkg = require('every-plugin/package.json');

  return {
    'every-plugin': {
      version: everyPluginPkg.version,
      singleton: true,
      requiredVersion: `^${everyPluginPkg.version}`,
      strictVersion: false,
      eager: false,
    },
    effect: {
      version: everyPluginPkg.dependencies.effect,
      singleton: true,
      requiredVersion: `${everyPluginPkg.dependencies.effect}`,
      strictVersion: false,
      eager: false,
    },
    zod: {
      version: everyPluginPkg.dependencies.zod,
      singleton: true,
      requiredVersion: `${everyPluginPkg.dependencies.zod}`,
      strictVersion: false,
      eager: false,
    },
    '@orpc/contract': {
      version: everyPluginPkg.dependencies['@orpc/contract'],
      singleton: true,
      requiredVersion: `${everyPluginPkg.dependencies['@orpc/contract']}`,
      strictVersion: false,
      eager: false,
    },
    '@orpc/server': {
      version: everyPluginPkg.dependencies['@orpc/server'],
      singleton: true,
      requiredVersion: `${everyPluginPkg.dependencies['@orpc/server']}`,
      strictVersion: false,
      eager: false,
    },
  };
}
