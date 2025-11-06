import path from 'node:path';
import fs from 'node:fs';
import { getNormalizedRemoteName } from 'every-plugin/normalize';

export interface PluginInfo {
  name: string;
  version: string;
  normalizedName: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export function getPluginInfo(context: string): PluginInfo {
  const pkgPath = path.join(context, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  return {
    name: pkg.name,
    version: pkg.version,
    normalizedName: getNormalizedRemoteName(pkg.name),
    dependencies: pkg.dependencies || {},
    peerDependencies: pkg.peerDependencies || {},
  };
}

export function loadDevConfig(devConfigPath: string) {
  try {
    const fullPath = path.resolve(devConfigPath);
    // Clear require cache to allow hot reloading
    delete require.cache[fullPath];
    return require(fullPath).default;
  } catch (error) {
    console.warn(`Could not load dev config from ${devConfigPath}:`, (error as Error).message);
    return null;
  }
}
