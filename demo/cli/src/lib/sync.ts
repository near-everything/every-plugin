import { execa } from "execa";
import { cp, mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { BosConfig } from "../config";

export interface FileSyncResult {
  package: string;
  files: string[];
  depsAdded?: string[];
  depsUpdated?: string[];
}

export interface FileSyncOptions {
  configDir: string;
  packages: string[];
  bosConfig: BosConfig;
  catalog?: Record<string, string>;
  force?: boolean;
}

export async function syncFiles(options: FileSyncOptions): Promise<FileSyncResult[]> {
  const { configDir, packages, bosConfig, catalog = {}, force } = options;
  const results: FileSyncResult[] = [];

  for (const pkg of packages) {
    const pkgDir = `${configDir}/${pkg}`;
    const pkgDirExists = await Bun.file(`${pkgDir}/package.json`).exists();
    if (!pkgDirExists) continue;

    const appConfig = bosConfig.app[pkg] as {
      template?: string;
      files?: string[];
      sync?: { dependencies?: boolean; devDependencies?: boolean };
    };

    if (!appConfig?.template || !appConfig?.files) {
      continue;
    }

    const tempDir = await mkdtemp(join(tmpdir(), `bos-files-${pkg}-`));

    try {
      await execa("npx", ["degit", appConfig.template, tempDir, "--force"], {
        stdio: "pipe",
      });

      const filesSynced: string[] = [];
      const depsAdded: string[] = [];
      const depsUpdated: string[] = [];

      for (const file of appConfig.files) {
        const srcPath = join(tempDir, file);
        const destPath = join(pkgDir, file);

        try {
          const destDir = dirname(destPath);
          await mkdir(destDir, { recursive: true });
          await cp(srcPath, destPath, { force: true, recursive: true });
          filesSynced.push(file);
        } catch {
        }
      }

      const syncConfig = appConfig.sync ?? { dependencies: true, devDependencies: true };

      if (syncConfig.dependencies !== false || syncConfig.devDependencies !== false) {
        const templatePkgPath = join(tempDir, "package.json");
        const localPkgPath = join(pkgDir, "package.json");

        try {
          const templatePkg = await Bun.file(templatePkgPath).json() as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            scripts?: Record<string, string>;
          };
          const localPkg = await Bun.file(localPkgPath).json() as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            scripts?: Record<string, string>;
          };

          if (syncConfig.dependencies !== false && templatePkg.dependencies) {
            if (!localPkg.dependencies) localPkg.dependencies = {};
            for (const [name, version] of Object.entries(templatePkg.dependencies)) {
              if (!(name in localPkg.dependencies)) {
                localPkg.dependencies[name] = name in catalog ? "catalog:" : version;
                depsAdded.push(name);
              } else if (localPkg.dependencies[name] !== "catalog:" && version !== localPkg.dependencies[name]) {
                localPkg.dependencies[name] = name in catalog ? "catalog:" : version;
                depsUpdated.push(name);
              }
            }
          }

          if (syncConfig.devDependencies !== false && templatePkg.devDependencies) {
            if (!localPkg.devDependencies) localPkg.devDependencies = {};
            for (const [name, version] of Object.entries(templatePkg.devDependencies)) {
              if (!(name in localPkg.devDependencies)) {
                localPkg.devDependencies[name] = name in catalog ? "catalog:" : version;
                depsAdded.push(name);
              } else if (localPkg.devDependencies[name] !== "catalog:" && version !== localPkg.devDependencies[name]) {
                localPkg.devDependencies[name] = name in catalog ? "catalog:" : version;
                depsUpdated.push(name);
              }
            }
          }

          if (templatePkg.scripts) {
            if (!localPkg.scripts) localPkg.scripts = {};
            for (const [name, script] of Object.entries(templatePkg.scripts)) {
              localPkg.scripts[name] = script;
            }
          }

          await Bun.write(localPkgPath, JSON.stringify(localPkg, null, 2));
        } catch {
        }
      }

      results.push({
        package: pkg,
        files: filesSynced,
        depsAdded: depsAdded.length > 0 ? depsAdded : undefined,
        depsUpdated: depsUpdated.length > 0 ? depsUpdated : undefined,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  return results;
}
