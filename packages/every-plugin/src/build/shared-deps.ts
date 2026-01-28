import pkg from "../../package.json";

export interface SharedDependencyConfig {
  version: string;
  singleton: boolean;
  strictVersion: boolean;
  eager: boolean;
}

export type SharedDependencies = Record<string, SharedDependencyConfig>;

export function getPluginSharedDependencies(): SharedDependencies {
  return {
    "every-plugin": {
      version: pkg.version,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    effect: {
      version: pkg.peerDependencies.effect,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    zod: {
      version: pkg.peerDependencies.zod,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    "@orpc/contract": {
      version: pkg.dependencies["@orpc/contract"],
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    "@orpc/server": {
      version: pkg.dependencies["@orpc/server"],
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  };
}

export function getMajorMinorVersion(version: string): string {
  const clean = version.replace(/^[\^~>=<]+/, "");
  const match = clean.match(/^(\d+)\.(\d+)/);
  if (!match) return "^0.0.0";
  return `^${match[1]}.${match[2]}.0`;
}

export function getPluginSharedDependenciesVersionRange(): SharedDependencies {
  const deps = getPluginSharedDependencies();
  const result: SharedDependencies = {};
  
  for (const [key, config] of Object.entries(deps)) {
    result[key] = {
      ...config,
      version: getMajorMinorVersion(config.version),
    };
  }
  
  return result;
}
