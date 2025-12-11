import everyPluginPkg from '../../../package.json';
import type { PluginInfo } from './utils';

export function buildSharedDependencies(pluginInfo: PluginInfo) {

  return {
    'every-plugin': {
      version: everyPluginPkg.version,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    effect: {
      version: everyPluginPkg.dependencies.effect,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    zod: {
      version: everyPluginPkg.dependencies.zod,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    '@orpc/contract': {
      version: everyPluginPkg.dependencies['@orpc/contract'],
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    '@orpc/server': {
      version: everyPluginPkg.dependencies['@orpc/server'],
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  };
}
