import pkg from "../../package.json";

export interface SharedDependencyConfig {
  version: string;
  singleton: boolean;
  strictVersion: boolean;
  eager: boolean;
}

export type SharedDependencies = Record<string, SharedDependencyConfig>;

const uiDeps = (pkg as any).sharedDependencies?.ui as Record<string, string> | undefined;

export function getPluginSharedDependencies(): SharedDependencies {
  return {
    "every-plugin": {
      version: pkg.version,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    effect: {
      version: pkg.dependencies.effect,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
    zod: {
      version: pkg.dependencies.zod,
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

function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, "");
}

export function getUISharedDependencies(): SharedDependencies {
  if (!uiDeps) return {};
  
  const result: SharedDependencies = {};
  for (const [name, version] of Object.entries(uiDeps)) {
    result[name] = {
      version: cleanVersion(version),
      singleton: true,
      strictVersion: false,
      eager: name === "react" || name === "react-dom",
    };
  }
  return result;
}

export function getHostSharedDependencies(): SharedDependencies {
  return {
    ...getPluginSharedDependencies(),
    ...getUISharedDependencies(),
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
