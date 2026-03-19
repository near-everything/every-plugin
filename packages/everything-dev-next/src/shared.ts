import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BosConfig, SharedDepConfig } from "./types";

export interface SharedUiResolvedDep {
	name: string;
	version: string;
	requiredVersion: string;
	shareScope: string;
	singleton: boolean;
	eager: boolean;
	strictVersion: boolean;
}

export interface SharedUiResolved {
	deps: Record<string, SharedUiResolvedDep>;
	fingerprintSha256: string;
}

export interface SharedSyncResult {
	mode: "catalog->bos" | "bos->catalog";
	hostMode: "local" | "remote";
	bosConfigChanged: boolean;
	catalogChanged: boolean;
	generatedChanged: boolean;
	resolved: SharedUiResolved;
}

function sha256(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

function extractSemverExact(input: unknown): string | null {
	if (typeof input !== "string") return null;
	const match = input.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
	return match ? match[0] : null;
}

function caretRange(version: string): string {
	return `^${version}`;
}

function stableDepsObject(
	deps: Record<string, SharedUiResolvedDep>,
): Record<string, SharedUiResolvedDep> {
	const keys = Object.keys(deps).sort((a, b) => a.localeCompare(b));
	const out: Record<string, SharedUiResolvedDep> = {};
	for (const k of keys) out[k] = deps[k]!;
	return out;
}

function fingerprintResolved(
	deps: Record<string, SharedUiResolvedDep>,
): string {
	const stable = stableDepsObject(deps);
	return sha256(JSON.stringify(stable));
}

function getSharedUiDeps(
	bosConfig: BosConfig,
): Record<string, SharedDepConfig> {
	const shared = bosConfig.shared ?? {};
	const ui = shared.ui ?? {};
	return ui;
}

export async function syncAndGenerateSharedUi(opts: {
	configDir: string;
	hostMode: "local" | "remote";
}): Promise<SharedSyncResult> {
	const bosConfigPath = join(opts.configDir, "bos.config.json");
	const packageJsonPath = join(opts.configDir, "package.json");
	const generatedPath = join(
		opts.configDir,
		".bos",
		"generated",
		"shared-ui.json",
	);

	const bosConfig: BosConfig = JSON.parse(readFileSync(bosConfigPath, "utf-8"));
	let pkgJson: any = {};
	try {
		pkgJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
	} catch {
		// package.json might not exist
	}

	const originalBos = JSON.stringify(bosConfig);
	const originalPkg = JSON.stringify(pkgJson);

	const sharedUi = getSharedUiDeps(bosConfig);
	const catalog = pkgJson?.workspaces?.catalog ?? {};

	const mode = opts.hostMode === "local" ? "catalog->bos" : "bos->catalog";

	if (mode === "catalog->bos") {
		for (const [name, cfg] of Object.entries(sharedUi)) {
			const version =
				catalog[name] ??
				extractSemverExact(cfg.version) ??
				extractSemverExact(cfg.requiredVersion);
			if (!version) continue;
			cfg.version = version;
			cfg.requiredVersion = caretRange(version);
			cfg.shareScope = cfg.shareScope ?? "default";
		}
	} else {
		for (const [name, cfg] of Object.entries(sharedUi)) {
			const version =
				extractSemverExact(cfg.version) ??
				extractSemverExact(cfg.requiredVersion);
			if (!version) continue;
			cfg.version = version;
			cfg.requiredVersion = caretRange(version);
			cfg.shareScope = cfg.shareScope ?? "default";
			if (catalog[name] !== version) {
				catalog[name] = version;
			}
		}
		if (!pkgJson.workspaces) pkgJson.workspaces = { packages: [], catalog: {} };
		pkgJson.workspaces.catalog = catalog;
	}

	const nextBos = JSON.stringify(bosConfig);
	const nextPkg = JSON.stringify(pkgJson);
	const bosConfigChanged = nextBos !== originalBos;
	const catalogChanged = nextPkg !== originalPkg;

	if (bosConfigChanged) {
		writeFileSync(bosConfigPath, JSON.stringify(bosConfig, null, 2) + "\n");
	}
	if (catalogChanged) {
		writeFileSync(packageJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
	}

	const resolvedDeps: Record<string, SharedUiResolvedDep> = {};
	for (const [name, cfg] of Object.entries(getSharedUiDeps(bosConfig))) {
		const version =
			catalog[name] ??
			extractSemverExact(cfg.version) ??
			extractSemverExact(cfg.requiredVersion);
		if (!version) continue;
		resolvedDeps[name] = {
			name,
			version,
			requiredVersion: caretRange(version),
			shareScope: cfg.shareScope ?? "default",
			singleton: cfg.singleton ?? false,
			eager: cfg.eager ?? false,
			strictVersion: cfg.strictVersion ?? false,
		};
	}

	const stableResolvedDeps = stableDepsObject(resolvedDeps);
	const resolved: SharedUiResolved = {
		deps: stableResolvedDeps,
		fingerprintSha256: fingerprintResolved(stableResolvedDeps),
	};

	const nextGenerated = {
		schemaVersion: 1,
		kind: "everything-dev/shared-ui",
		generatedAt: new Date().toISOString(),
		ui: {
			deps: stableResolvedDeps,
			fingerprintSha256: resolved.fingerprintSha256,
		},
		inputs: {
			mode,
			hostMode: opts.hostMode,
		},
	};

	let prevFingerprint: string | null = null;
	try {
		const prev = JSON.parse(readFileSync(generatedPath, "utf-8"));
		prevFingerprint = prev?.ui?.fingerprintSha256 ?? null;
	} catch {
		// ignore
	}

	mkdirSync(dirname(generatedPath), { recursive: true });
	writeFileSync(generatedPath, JSON.stringify(nextGenerated, null, 2) + "\n");

	const generatedChanged =
		prevFingerprint !== nextGenerated.ui.fingerprintSha256;

	return {
		mode,
		hostMode: opts.hostMode,
		bosConfigChanged,
		catalogChanged,
		generatedChanged,
		resolved,
	};
}

export function loadGeneratedSharedUi(
	configDir: string,
): SharedUiResolved | null {
	const generatedPath = join(configDir, ".bos", "generated", "shared-ui.json");
	try {
		const content = JSON.parse(readFileSync(generatedPath, "utf-8"));
		return content?.ui ?? null;
	} catch {
		return null;
	}
}
