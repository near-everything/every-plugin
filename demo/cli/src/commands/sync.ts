import { join } from "path";
import { getConfigDir, getPackages } from "../config";

interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface WorkspacePackageJson extends PackageJson {
  workspaces?: {
    packages?: string[];
    catalog?: Record<string, string>;
  };
}

interface EveryPluginPackageJson extends PackageJson {
  sharedDependencies?: {
    ui?: Record<string, string>;
  };
}

const PLUGIN_DEPS = [
  "@orpc/client",
  "@orpc/contract",
  "@orpc/experimental-publisher",
  "@orpc/openapi",
  "@orpc/react-query",
  "@orpc/server",
  "@orpc/zod",
  "effect",
  "zod",
] as const;

async function readPackageJson(path: string): Promise<PackageJson | null> {
  try {
    const file = Bun.file(path);
    const content = await file.text();
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writePackageJson(path: string, pkg: PackageJson): Promise<void> {
  await Bun.write(path, JSON.stringify(pkg, null, 2) + "\n");
}

function getVersionFromRange(version: string): string {
  return version.replace(/^[\^~>=<]+/, "");
}

export async function syncDependencies(silent = false): Promise<boolean> {
  const configDir = getConfigDir();
  const packages = getPackages();

  const everyPluginPath = join(configDir, "node_modules/every-plugin/package.json");
  const everyPluginPkg = await readPackageJson(everyPluginPath) as EveryPluginPackageJson | null;

  if (!everyPluginPkg) {
    if (!silent) {
      console.log("  [!] every-plugin not installed, skipping sync");
    }
    return false;
  }

  const targetVersions: Record<string, string> = {};
  const everyPluginDeps = everyPluginPkg.dependencies || {};
  const uiDeps = everyPluginPkg.sharedDependencies?.ui || {};

  for (const dep of PLUGIN_DEPS) {
    if (everyPluginDeps[dep]) {
      targetVersions[dep] = everyPluginDeps[dep];
    }
  }

  for (const [dep, version] of Object.entries(uiDeps)) {
    targetVersions[dep] = version;
  }

  if (!silent) {
    console.log("  [i] Syncing shared dependencies from every-plugin@" + everyPluginPkg.version);
  }

  let hasChanges = false;
  const updates: Array<{ pkg: string; dep: string; from: string; to: string }> = [];

  for (const pkgName of packages) {
    const pkgPath = join(configDir, pkgName, "package.json");
    const pkg = await readPackageJson(pkgPath);

    if (!pkg) continue;

    let pkgModified = false;

    const depSections = ["dependencies", "devDependencies"] as const;

    for (const section of depSections) {
      const deps = pkg[section];
      if (!deps) continue;

      for (const [dep, targetVersion] of Object.entries(targetVersions)) {
        if (deps[dep]) {
          const currentVersion = getVersionFromRange(deps[dep]);
          const newVersion = getVersionFromRange(targetVersion);

          if (currentVersion !== newVersion) {
            updates.push({
              pkg: pkgName,
              dep,
              from: deps[dep],
              to: targetVersion,
            });
            deps[dep] = targetVersion;
            pkgModified = true;
          }
        }
      }
    }

    if (pkgModified) {
      await writePackageJson(pkgPath, pkg);
      hasChanges = true;
    }
  }

  const rootPkgPath = join(configDir, "package.json");
  const rootPkg = await readPackageJson(rootPkgPath) as WorkspacePackageJson | null;

  if (rootPkg?.workspaces?.catalog) {
    const catalog = rootPkg.workspaces.catalog;
    let catalogModified = false;

    for (const [dep, targetVersion] of Object.entries(targetVersions)) {
      if (catalog[dep]) {
        const currentVersion = getVersionFromRange(catalog[dep]);
        const newVersion = getVersionFromRange(targetVersion);

        if (currentVersion !== newVersion) {
          updates.push({
            pkg: "catalog",
            dep,
            from: catalog[dep],
            to: targetVersion,
          });
          catalog[dep] = targetVersion;
          catalogModified = true;
        }
      }
    }

    if (catalogModified) {
      await writePackageJson(rootPkgPath, rootPkg);
      hasChanges = true;
    }
  }

  if (!silent && updates.length > 0) {
    console.log("\n  Updates applied:");
    for (const u of updates) {
      console.log(`    ${u.pkg}: ${u.dep} ${u.from} → ${u.to}`);
    }
    console.log("");
  } else if (!silent && updates.length === 0) {
    console.log("  [✓] All shared dependencies are in sync\n");
  }

  return hasChanges;
}

export async function syncCommand() {
  console.log("\n  Checking dependency versions...\n");

  const hasChanges = await syncDependencies(false);

  if (hasChanges) {
    console.log("  [i] Running bun install to update lockfile...\n");

    const configDir = getConfigDir();
    const proc = Bun.spawn(["bun", "install"], {
      cwd: configDir,
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;

    console.log("\n  [✓] Sync complete\n");
  }
}
