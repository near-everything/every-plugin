import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type {
	ShareArgs,
	SharedGetter,
	UserOptions,
} from "@module-federation/runtime-core/types";

import type { BosConfigInput, SourceMode } from "../types";

export type SharedUiDepPolicy = {
	version?: string;
	requiredVersion?: string;
	singleton?: boolean;
	eager?: boolean;
	strictVersion?: boolean;
	shareScope?: string;
};

export type SharedUiDeps = Record<string, SharedUiDepPolicy>;

export type SharedUiResolvedDep = {
	name: string;
	version: string;
	requiredVersion: string;
	shareScope: string;
	singleton: boolean;
	eager: boolean;
	strictVersion: boolean;
};

export type SharedUiResolved = {
	deps: Record<string, SharedUiResolvedDep>;
	fingerprintSha256: string;
};

export type SharedUiGeneratedFileV1 = {
	schemaVersion: 1;
	kind: "everything-dev/shared-ui";
	generatedAt: string;
	ui: {
		deps: Record<string, SharedUiResolvedDep>;
		fingerprintSha256: string;
	};
	inputs: {
		mode: "catalog->bos" | "bos->catalog";
		hostMode: SourceMode;
		bosConfigSha256: string;
		catalogSha256: string;
	};
};

export type SharedSyncResult = {
	mode: "catalog->bos" | "bos->catalog";
	hostMode: SourceMode;
	bosConfigChanged: boolean;
	catalogChanged: boolean;
	generatedChanged: boolean;
	resolved: SharedUiResolved;
};

const sha256 = (input: string) =>
	crypto.createHash("sha256").update(input).digest("hex");

function extractSemverExact(input: unknown): string | null {
	if (typeof input !== "string") return null;
	const match = input.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
	return match ? match[0] : null;
}

function caretRange(version: string): string {
	return `^${version}`;
}

function stableDepsObject(deps: Record<string, SharedUiResolvedDep>) {
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

async function readJsonFile<T>(
	filePath: string,
): Promise<{ value: T; raw: string }> {
	const raw = await Bun.file(filePath).text();
	return { value: JSON.parse(raw) as T, raw };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await Bun.write(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getSharedUiDeps(bosConfig: BosConfigInput): SharedUiDeps {
	const shared = (bosConfig.shared ?? {}) as Record<string, unknown>;
	const ui = (shared.ui ?? {}) as Record<string, unknown>;

	const out: SharedUiDeps = {};
	for (const [name, cfg] of Object.entries(ui)) {
		out[name] =
			(cfg && typeof cfg === "object" ? (cfg as SharedUiDepPolicy) : {}) ?? {};
	}
	return out;
}

function setSharedUiDeps(bosConfig: BosConfigInput, deps: SharedUiDeps) {
	if (!bosConfig.shared || typeof bosConfig.shared !== "object") {
		bosConfig.shared = {} as any;
	}
	(bosConfig.shared as any).ui = deps;
}

function getCatalog(pkgJson: any): Record<string, string> {
	const catalog = pkgJson?.workspaces?.catalog;
	if (!catalog || typeof catalog !== "object") return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(catalog as Record<string, unknown>)) {
		if (typeof v === "string") out[k] = v;
	}
	return out;
}

function setCatalog(pkgJson: any, catalog: Record<string, string>) {
	if (!pkgJson.workspaces || typeof pkgJson.workspaces !== "object") {
		pkgJson.workspaces = { packages: [], catalog: {} };
	}
	if (
		!pkgJson.workspaces.catalog ||
		typeof pkgJson.workspaces.catalog !== "object"
	) {
		pkgJson.workspaces.catalog = {};
	}
	pkgJson.workspaces.catalog = catalog;
}

export async function syncAndGenerateSharedUi(opts: {
	configDir: string;
	hostMode: SourceMode;
}): Promise<SharedSyncResult> {
	const bosConfigPath = path.join(opts.configDir, "bos.config.json");
	const packageJsonPath = path.join(opts.configDir, "package.json");
	const generatedPath = path.join(
		opts.configDir,
		".bos",
		"generated",
		"shared-ui.json",
	);

	const [{ value: bosConfig, raw: bosRaw }, { value: pkgJson, raw: pkgRaw }] =
		await Promise.all([
			readJsonFile<BosConfigInput>(bosConfigPath),
			readJsonFile<any>(packageJsonPath),
		]);

	const originalBos = JSON.stringify(bosConfig);
	const originalPkg = JSON.stringify(pkgJson);

	const sharedUi = getSharedUiDeps(bosConfig);
	const catalog = getCatalog(pkgJson);

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
			cfg.shareScope ||= "default";
		}
		setSharedUiDeps(bosConfig, sharedUi);
	} else {
		for (const [name, cfg] of Object.entries(sharedUi)) {
			const version =
				extractSemverExact(cfg.version) ??
				extractSemverExact(cfg.requiredVersion);
			if (!version) continue;
			cfg.version = version;
			cfg.requiredVersion = caretRange(version);
			cfg.shareScope ||= "default";
			if (catalog[name] !== version) {
				catalog[name] = version;
			}
		}
		setSharedUiDeps(bosConfig, sharedUi);
		setCatalog(pkgJson, catalog);
	}

	const nextBos = JSON.stringify(bosConfig);
	const nextPkg = JSON.stringify(pkgJson);
	const bosConfigChanged = nextBos !== originalBos;
	const catalogChanged = nextPkg !== originalPkg;

	if (bosConfigChanged) {
		await writeJsonFile(bosConfigPath, bosConfig);
	}
	if (catalogChanged) {
		await writeJsonFile(packageJsonPath, pkgJson);
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

	const nextGenerated: SharedUiGeneratedFileV1 = {
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
			bosConfigSha256: sha256(
				bosConfigChanged ? JSON.stringify(bosConfig, null, 2) + "\n" : bosRaw,
			),
			catalogSha256: sha256(
				catalogChanged ? JSON.stringify(pkgJson, null, 2) + "\n" : pkgRaw,
			),
		},
	};

	let prevFingerprint: string | null = null;
	let prevMode: string | null = null;
	let prevHostMode: string | null = null;
	try {
		const prev = await Bun.file(generatedPath).json();
		prevFingerprint = prev?.ui?.fingerprintSha256 ?? null;
		prevMode = prev?.inputs?.mode ?? null;
		prevHostMode = prev?.inputs?.hostMode ?? null;
	} catch {
		// ignore
	}

	await mkdir(path.dirname(generatedPath), { recursive: true });

	const generatedChanged =
		prevFingerprint !== nextGenerated.ui.fingerprintSha256 ||
		prevMode !== nextGenerated.inputs.mode ||
		prevHostMode !== nextGenerated.inputs.hostMode;

	await writeJsonFile(generatedPath, nextGenerated);

	return {
		mode,
		hostMode: opts.hostMode,
		bosConfigChanged,
		catalogChanged,
		generatedChanged,
		resolved,
	};
}

// SSR-only helper: produce MF runtime shared userOptions with compile-time type safety.
export function toMfRuntimeShared(opts: {
	resolved: SharedUiResolved;
	get: (pkgName: string) => SharedGetter | null;
}): NonNullable<UserOptions["shared"]> {
	const out: NonNullable<UserOptions["shared"]> = {};
	for (const dep of Object.values(opts.resolved.deps)) {
		const get = opts.get(dep.name);
		if (!get) continue;

		const shareArgs: ShareArgs = {
			version: dep.version,
			scope: dep.shareScope,
			shareConfig: {
				requiredVersion: dep.requiredVersion,
				singleton: dep.singleton,
				eager: dep.eager,
				strictVersion: dep.strictVersion,
			},
			get,
		};

		out[dep.name] = shareArgs;
	}
	return out;
}
