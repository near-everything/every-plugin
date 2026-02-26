import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { calculateRequiredDeposit, Graph } from "near-social-js";

import { runMonitorCli } from "./components/monitor-view";
import {
	type AppConfig,
	type BosConfig as BosConfigType,
	DEFAULT_DEV_CONFIG,
	getProjectRoot,
	loadConfig,
	parsePort,
	type RemoteConfig,
	resolvePackages,
	type SourceMode,
} from "./config";
import {
	type BuildOptions,
	bosContract,
	type PublishOptions,
} from "./contract";
import {
	getBuildEnv,
	hasZephyrConfig,
	loadBosEnv,
	ZEPHYR_DOCS_URL,
} from "./lib/env";
import {
	createSubaccount,
	ensureNearCli,
	executeTransaction,
} from "./lib/near-cli";
import {
	createNovaClient,
	getNovaConfig,
	getSecretsGroupId,
	parseEnvFile,
	registerSecretsGroup,
	removeNovaCredentials,
	retrieveSecrets,
	saveNovaCredentials,
	uploadSecrets,
	verifyNovaCredentials,
} from "./lib/nova";
import { type AppOrchestrator, startApp } from "./lib/orchestrator";
import { createProcessRegistry } from "./lib/process-registry";
import {
	createSnapshotWithPlatform,
	formatSnapshotSummary,
	runWithInfo,
} from "./lib/resource-monitor";
import {
	formatReportSummary,
	navigateTo,
	runLoginFlow,
	runNavigationFlow,
	SessionRecorder,
} from "./lib/session-recorder";
import { syncFiles } from "./lib/sync";
import { run } from "./utils/run";
import { colors, icons } from "./utils/theme";

interface BosDeps {
	bosConfig: BosConfigType | null;
	configDir: string;
	nearPrivateKey?: string;
}

const DEFAULT_GATEWAY = "everything.dev";

function getGatewayDomain(config: BosConfigType | null): string {
	if (!config) return DEFAULT_GATEWAY;
	const gateway = config.gateway as string | { production: string } | undefined;
	if (typeof gateway === "string") {
		return gateway.replace(/^https?:\/\//, "");
	}
	if (gateway && typeof gateway === "object" && "production" in gateway) {
		return gateway.production.replace(/^https?:\/\//, "");
	}
	return DEFAULT_GATEWAY;
}

function getAccountForNetwork(
	config: BosConfigType,
	network: "mainnet" | "testnet",
): string {
	if (network === "testnet") {
		if (!config.testnet) {
			throw new Error(
				"bos.config.json must have a 'testnet' field to use testnet network",
			);
		}
		return config.testnet;
	}
	return config.account;
}

function getSocialContract(network: "mainnet" | "testnet"): string {
	return network === "testnet" ? "v1.social08.testnet" : "social.near";
}

function getSocialExplorerUrl(
	network: "mainnet" | "testnet",
	path: string,
): string {
	const baseUrl =
		network === "testnet" ? "https://test.near.social" : "https://near.social";
	return `${baseUrl}/${path}`;
}

function buildSocialSetArgs(
	account: string,
	gatewayDomain: string,
	config: BosConfigType,
): object {
	return {
		data: {
			[account]: {
				bos: {
					gateways: {
						[gatewayDomain]: {
							"bos.config.json": JSON.stringify(config),
						},
					},
				},
			},
		},
	};
}

function parseSourceMode(
	value: string | undefined,
	defaultValue: SourceMode,
): SourceMode {
	if (value === "local" || value === "remote") return value;
	return defaultValue;
}

function buildAppConfig(options: {
	host?: string;
	ui?: string;
	api?: string;
	proxy?: boolean;
}): AppConfig {
	return {
		host: parseSourceMode(options.host, DEFAULT_DEV_CONFIG.host),
		ui: parseSourceMode(options.ui, DEFAULT_DEV_CONFIG.ui),
		api: parseSourceMode(options.api, DEFAULT_DEV_CONFIG.api),
		proxy: options.proxy,
	};
}

function buildDescription(config: AppConfig): string {
	const parts: string[] = [];

	if (
		config.host === "local" &&
		config.ui === "local" &&
		config.api === "local" &&
		!config.proxy
	) {
		return "Full Local Development";
	}

	if (config.host === "remote") parts.push("Remote Host");
	else parts.push("Local Host");

	if (config.ui === "remote") parts.push("Remote UI");
	if (config.proxy) parts.push("Proxy API → Production");
	else if (config.api === "remote") parts.push("Remote API");

	return parts.join(" + ");
}

function determineProcesses(config: AppConfig): string[] {
	const processes: string[] = [];

	if (config.ui === "local") {
		processes.push("ui-ssr");
		processes.push("ui");
	}

	if (config.api === "local" && !config.proxy) {
		processes.push("api");
	}

	processes.push("host");

	return processes;
}

function isValidProxyUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function resolveProxyUrl(bosConfig: BosConfigType | null): string | null {
	if (!bosConfig) return null;

	const apiConfig = bosConfig.app.api as RemoteConfig | undefined;
	if (!apiConfig) return null;

	if (apiConfig.proxy && isValidProxyUrl(apiConfig.proxy)) {
		return apiConfig.proxy;
	}

	if (apiConfig.production && isValidProxyUrl(apiConfig.production)) {
		return apiConfig.production;
	}

	return null;
}

async function buildEnvVars(
	config: AppConfig,
	bosConfig?: BosConfigType | null,
): Promise<Record<string, string>> {
	const env: Record<string, string> = {};

	env.HOST_SOURCE = config.host;
	env.UI_SOURCE = config.ui;
	env.API_SOURCE = config.api;

	if (config.host === "remote") {
		const remoteUrl = bosConfig?.app.host.production;
		if (remoteUrl) {
			env.HOST_REMOTE_URL = remoteUrl;
		}
	}

	if (config.proxy && bosConfig) {
		const proxyUrl = resolveProxyUrl(bosConfig);
		if (proxyUrl) {
			env.API_PROXY = proxyUrl;
		}
	}

	return env;
}

const buildCommands: Record<string, { cmd: string; args: string[] }> = {
	host: { cmd: "rsbuild", args: ["build"] },
	ui: { cmd: "build", args: [] },
	api: { cmd: "rspack", args: ["build"] },
};

export default createPlugin({
	variables: z.object({
		configPath: z.string().optional(),
	}),

	secrets: z.object({
		nearPrivateKey: z.string().optional(),
	}),

	contract: bosContract,

	initialize: (config) =>
		Effect.promise(async () => {
			const configResult = await loadConfig({
				path: config.variables.configPath,
			});
			const configDir = getProjectRoot();

			return {
				bosConfig: configResult?.config ?? null,
				configDir,
				nearPrivateKey: config.secrets.nearPrivateKey,
			} as BosDeps;
		}),

	shutdown: () => Effect.void,

	createRouter: (deps: BosDeps, builder) => ({
		dev: builder.dev.handler(async ({ input }) => {
			const { resolved, autoRemote } = await resolvePackages(
				["host", "ui", "api"],
				{
					host: input.host as SourceMode,
					ui: input.ui as SourceMode,
					api: input.api as SourceMode,
				},
			);

			// Extract modes from resolved packages
			const modes = {
				host: resolved.host.mode,
				ui: resolved.ui.mode,
				api: resolved.api.mode,
			};

			if (autoRemote.length > 0) {
				console.log();
				console.log(
					colors.cyan(`  ${icons.config} Auto-detecting packages...`),
				);
				for (const pkg of autoRemote) {
					console.log(
						colors.dim(`    ${pkg} not found locally → using remote`),
					);
				}
				console.log();
			}

			const appConfig = buildAppConfig({
				host: modes.host,
				ui: modes.ui,
				api: modes.api,
				proxy: input.proxy,
			});

			if (appConfig.host === "remote") {
				const remoteUrl = deps.bosConfig?.app.host.production;
				if (!remoteUrl) {
					return {
						status: "error" as const,
						description: "No remote URL configured for host",
						processes: [],
						autoRemote,
					};
				}
			}

			let proxyUrl: string | undefined;
			if (appConfig.proxy) {
				proxyUrl = resolveProxyUrl(deps.bosConfig) ?? undefined;
				if (!proxyUrl) {
					console.log();
					console.log(
						colors.error(
							`  ${icons.err} Proxy mode requested but no valid proxy URL found`,
						),
					);
					console.log(
						colors.dim(
							`    Configure 'api.proxy' or 'api.production' in bos.config.json`,
						),
					);
					console.log();
					return {
						status: "error" as const,
						description: "No valid proxy URL configured in bos.config.json",
						processes: [],
						autoRemote,
					};
				}
			}

			const processes = determineProcesses(appConfig);
			const env = await buildEnvVars(appConfig, deps.bosConfig);
			const description = buildDescription(appConfig);

			const orchestrator: AppOrchestrator = {
				packages: processes,
				env,
				description,
				appConfig,
				bosConfig: deps.bosConfig ?? undefined,
				port: input.port,
				interactive: input.interactive,
			};

			startApp(orchestrator);

			return {
				status: "started" as const,
				description,
				processes,
			};
		}),

		start: builder.start.handler(async ({ input }) => {
			let remoteConfig: BosConfigType | null = null;

			if (input.account && input.domain) {
				const graph = new Graph();
				const configPath = `${input.account}/bos/gateways/${input.domain}/bos.config.json`;

				try {
					const data = await graph.get({ keys: [configPath] });
					if (data) {
						const parts = configPath.split("/");
						let current: unknown = data;
						for (const part of parts) {
							if (current && typeof current === "object" && part in current) {
								current = (current as Record<string, unknown>)[part];
							} else {
								current = null;
								break;
							}
						}
						if (typeof current === "string") {
							remoteConfig = JSON.parse(current) as BosConfigType;
							// Config is used directly, no need to write to disk or set global state
						}
					}
				} catch (error) {
					console.error(`Failed to fetch config from social.near:`, error);
					return {
						status: "error" as const,
						url: "",
					};
				}

				if (!remoteConfig) {
					console.error(`No config found at ${configPath}`);
					return {
						status: "error" as const,
						url: "",
					};
				}
			}

			const config = remoteConfig || deps.bosConfig;

			if (!config) {
				console.error(
					"No configuration available. Provide --account and --domain, or run from a BOS project directory.",
				);
				return {
					status: "error" as const,
					url: "",
				};
			}

			const port = input.port ?? 3000;

			const env: Record<string, string> = {
				NODE_ENV: "production",
				HOST_SOURCE: "remote",
				UI_SOURCE: "remote",
				API_SOURCE: "remote",
				BOS_ACCOUNT: config.account,
				HOST_REMOTE_URL: config.app.host.production,
				UI_REMOTE_URL: config.app.ui.production,
				API_REMOTE_URL: config.app.api.production,
			};

			if (process.env.HOST_URL) {
				env.HOST_URL = process.env.HOST_URL;
			}

			const uiConfig = config.app.ui as { ssr?: string };
			if (uiConfig.ssr) {
				env.UI_SSR_URL = uiConfig.ssr;
			}

			const orchestrator: AppOrchestrator = {
				packages: ["host"],
				env,
				description: `Production Mode (${config.account})`,
				appConfig: {
					host: "remote",
					ui: "remote",
					api: "remote",
				},
				bosConfig: config,
				port,
				interactive: input.interactive,
				noLogs: true,
			};

			startApp(orchestrator);

			return {
				status: "running" as const,
				url: `http://localhost:${port}`,
			};
		}),

		serve: builder.serve.handler(async ({ input }) => {
			const port = input.port;

			return {
				status: "serving" as const,
				url: `http://localhost:${port}`,
				endpoints: {
					rpc: `http://localhost:${port}/api/rpc`,
					docs: `http://localhost:${port}/api`,
				},
			};
		}),

		build: builder.build.handler(async ({ input }: { input: BuildOptions }) => {
			const allPackages = deps.bosConfig ? Object.keys(deps.bosConfig.app) : [];
			const { configDir } = deps;

			const targets =
				input.packages === "all"
					? allPackages
					: input.packages
							.split(",")
							.map((p) => p.trim())
							.filter((p) => allPackages.includes(p));

			if (targets.length === 0) {
				console.log(colors.dim(`  No valid packages to build`));
				return {
					status: "error" as const,
					built: [],
					skipped: [],
				};
			}

			// Check which packages exist locally
			const existing: string[] = [];
			const missing: string[] = [];
			for (const pkg of targets) {
				const pkgPath = `${configDir}/${pkg}/package.json`;
				const exists = await Bun.file(pkgPath).exists();
				if (exists) {
					existing.push(pkg);
				} else {
					missing.push(pkg);
				}
			}

			if (missing.length > 0) {
				console.log();
				console.log(
					colors.cyan(`  ${icons.config} Auto-detecting packages...`),
				);
				for (const pkg of missing) {
					console.log(colors.dim(`    ${pkg} not found locally → skipping`));
				}
				console.log();
			}

			if (existing.length === 0) {
				console.log(colors.dim(`  No packages found locally to build`));
				return {
					status: "error" as const,
					built: [],
					skipped: missing,
				};
			}

			const built: string[] = [];

			const buildEffect = Effect.gen(function* () {
				const bosEnv = yield* loadBosEnv;
				const env = getBuildEnv(bosEnv);

				if (!input.deploy) {
					env.NODE_ENV = "development";
				} else {
					env.NODE_ENV = "production";
					env.DEPLOY = "true";
					if (!hasZephyrConfig(bosEnv)) {
						console.log(
							colors.dim(
								`  ${icons.config} Zephyr tokens not configured - you may be prompted to login`,
							),
						);
						console.log(colors.dim(`  Setup: ${ZEPHYR_DOCS_URL}`));
						console.log();
					}
				}

				for (const target of existing) {
					const buildConfig = buildCommands[target];
					if (!buildConfig) continue;

					yield* Effect.tryPromise({
						try: () =>
							run("bun", ["run", buildConfig.cmd, ...buildConfig.args], {
								cwd: `${configDir}/${target}`,
								env,
							}),
						catch: (e) => new Error(`Build failed for ${target}: ${e}`),
					});
					built.push(target);
				}
			});

			await Effect.runPromise(buildEffect);

			return {
				status: "success" as const,
				built,
				skipped: missing,
				deployed: input.deploy,
			};
		}),

		publish: builder.publish.handler(
			async ({ input }: { input: PublishOptions }) => {
				const { bosConfig, nearPrivateKey } = deps;

				if (!bosConfig) {
					return {
						status: "error" as const,
						txHash: "",
						registryUrl: "",
						error:
							"No bos.config.json found. Run from a BOS project directory.",
					};
				}

				const network = input.network;

				try {
					const account = getAccountForNetwork(bosConfig, network);
					const gatewayDomain = getGatewayDomain(bosConfig);
					const socialContract = getSocialContract(network);
					const socialPath = `${account}/bos/gateways/${gatewayDomain}/bos.config.json`;

					const publishEffect = Effect.gen(function* () {
						yield* ensureNearCli;

						const bosEnv = yield* loadBosEnv;
						const privateKey = nearPrivateKey || bosEnv.NEAR_PRIVATE_KEY;

						const socialArgs = buildSocialSetArgs(
							account,
							gatewayDomain,
							bosConfig,
						) as {
							data: Record<string, Record<string, unknown>>;
						};
						const argsBase64 = Buffer.from(JSON.stringify(socialArgs)).toString(
							"base64",
						);

						const graph = new Graph({
							network,
							contractId: socialContract,
						});
						const storageBalance = yield* Effect.tryPromise({
							try: () => graph.storageBalanceOf(account),
							catch: () => new Error("Failed to fetch storage balance"),
						});

						const requiredDeposit = calculateRequiredDeposit({
							data: socialArgs.data,
							storageBalance: storageBalance
								? {
										available: BigInt(storageBalance.available),
										total: BigInt(storageBalance.total),
									}
								: null,
						});
						const depositAmount = requiredDeposit.toFixed();

						if (input.dryRun) {
							return {
								status: "dry-run" as const,
								txHash: "",
								registryUrl: getSocialExplorerUrl(network, socialPath),
							};
						}

						const result = yield* executeTransaction({
							account,
							contract: socialContract,
							method: "set",
							argsBase64,
							network,
							privateKey,
							gas: "300Tgas",
							deposit:
								depositAmount === "0"
									? "1yoctoNEAR"
									: `${depositAmount}yoctoNEAR`,
						});

						return {
							status: "published" as const,
							txHash: result.txHash || "unknown",
							registryUrl: getSocialExplorerUrl(network, socialPath),
						};
					});

					return await Effect.runPromise(publishEffect);
				} catch (error) {
					return {
						status: "error" as const,
						txHash: "",
						registryUrl: "",
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			},
		),

		create: builder.create.handler(async ({ input }) => {
			const { join } = await import("path");
			const { mkdir, stat, rm, writeFile } = await import("fs/promises");
			const { Graph } = await import("near-social-js");

			// Parse GitHub template format: owner/repo/subdir or owner/repo
			function parseTemplate(template: string): {
				owner: string;
				repo: string;
				subdir: string;
			} {
				const parts = template.split("/");
				if (parts.length < 2) {
					throw new Error(
						`Invalid template format: ${template}. Expected: owner/repo or owner/repo/subdir`,
					);
				}
				const owner = parts[0];
				const repo = parts[1];
				const subdir = parts.slice(2).join("/");
				return { owner, repo, subdir };
			}

			// Fetch parent BOS config from Near Social
			async function fetchParentConfig(templateUrl: string) {
				const match = templateUrl.match(/^bos:\/\/([^/]+)\/(.+)$/);
				if (!match) throw new Error("Invalid template URL format");
				const [, account, gateway] = match;

				const graph = new Graph();
				const configPath = `${account}/bos/gateways/${gateway}/bos.config.json`;
				const data = await graph.get({ keys: [configPath] });

				if (!data) return null;

				const parts = configPath.split("/");
				let current: unknown = data;
				for (const part of parts) {
					if (current && typeof current === "object" && part in current) {
						current = (current as Record<string, unknown>)[part];
					} else {
						return null;
					}
				}

				return typeof current === "string" ? JSON.parse(current) : null;
			}

			// Generate .env.example with secrets from parent config
			async function generateEnvExample(parentConfig: any): Promise<string> {
				const lines: string[] = [
					"# Environment Variables",
					"# Copy this file to .env and fill in your values",
					"",
				];

				// Add host secrets
				if (parentConfig?.app?.host?.secrets?.length > 0) {
					lines.push("# Host Secrets (from template)");
					for (const secret of parentConfig.app.host.secrets) {
						lines.push(`${secret}=`);
					}
					lines.push("");
				}

				// Add API secrets
				if (parentConfig?.app?.api?.secrets?.length > 0) {
					lines.push("# API Secrets (from template)");
					for (const secret of parentConfig.app.api.secrets) {
						lines.push(`${secret}=`);
					}
					lines.push("");
				}

				lines.push("# Zephyr Cloud (for deployment)");
				lines.push("ZE_SERVER_TOKEN=");
				lines.push("ZE_USER_EMAIL=");
				lines.push("");
				lines.push("# NEAR (optional - for automated publishing)");
				lines.push("# NEAR_PRIVATE_KEY=ed25519:...");

				return lines.join("\n");
			}

			// Clone template using degit
			async function cloneTemplate(
				gitTemplate: string,
				destDir: string,
				packages: string[],
			): Promise<void> {
				const { owner, repo, subdir } = parseTemplate(gitTemplate);
				const baseTemplate = subdir
					? `${owner}/${repo}/${subdir}`
					: `${owner}/${repo}`;

				// Import degit
				const { default: degit } = await import("degit");

				// Clone packages
				for (const pkg of packages) {
					const pkgTemplate = `${baseTemplate}/${pkg}`;
					const pkgDest = join(destDir, pkg);

					const emitter = degit(pkgTemplate, {
						cache: false,
						force: true,
						verbose: false,
					});

					await emitter.clone(pkgDest);
				}

				// Clone root files (using demo directory or root)
				const rootTemplate = baseTemplate;
				const rootEmitter = degit(rootTemplate, {
					cache: false,
					force: true,
					verbose: false,
				});

				await rootEmitter.clone(destDir);
			}

			// Verify template exists on GitHub
			async function verifyTemplate(gitTemplate: string): Promise<boolean> {
				try {
					const { owner, repo } = parseTemplate(gitTemplate);
					const { execa } = await import("execa");
					await execa(
						"git",
						["ls-remote", `https://github.com/${owner}/${repo}.git`, "HEAD"],
						{
							timeout: 10000,
						},
					);
					return true;
				} catch {
					return false;
				}
			}

			// Default template URL
			const DEFAULT_TEMPLATE = "bos://every.near/everything.dev";
			const templateUrl = input.template || DEFAULT_TEMPLATE;

			// Get project name
			let projectName = input.name || "";

			// Interactive prompts if needed
			const hasAllRequiredArgs = input.account && projectName;
			const usePrompts = !hasAllRequiredArgs;

			let account = input.account || "";
			let testnet = input.testnet || "";
			let includeHost = input.includeHost || false;
			let includeGateway = input.includeGateway || false;

			if (usePrompts) {
				// Import prompts dynamically
				const { input: inquirerInput, confirm } = await import(
					"@inquirer/prompts"
				);

				if (!projectName) {
					projectName = await inquirerInput({
						message: "Project name:",
						validate: (val) => val.length > 0 || "Project name is required",
					});
				}

				if (!account) {
					account = await inquirerInput({
						message: "NEAR account (e.g., myname.near):",
						default: `${projectName}.near`,
						validate: (val) =>
							val.includes(".near") || "Must be a valid NEAR account",
					});
				}

				const testnetInput = await inquirerInput({
					message: "Testnet account (optional, press Enter to skip):",
					default: "",
				});
				testnet = testnetInput || "";

				includeHost = await confirm({
					message:
						"Include host package locally? (No = use remote from everything.dev)",
					default: false,
				});

				includeGateway = await confirm({
					message:
						"Include gateway package locally? (No = use remote from everything.dev)",
					default: false,
				});
			}

			const destDir = join(process.cwd(), projectName);

			try {
				// Check if directory already exists
				try {
					await stat(destDir);
					return {
						status: "error" as const,
						path: projectName,
						error: `Directory ${projectName} already exists`,
					};
				} catch {
					// Directory doesn't exist, continue
				}

				// Fetch parent BOS config to get templates
				const parentConfig = await fetchParentConfig(templateUrl);
				if (!parentConfig) {
					return {
						status: "error" as const,
						path: projectName,
						error: `Failed to fetch parent config from ${templateUrl}`,
					};
				}

				// Get GitHub template from parent config
				const gitTemplate =
					parentConfig.template || "near-everything/every-plugin/demo";

				// Verify template exists
				const templateExists = await verifyTemplate(gitTemplate);
				if (!templateExists) {
					return {
						status: "error" as const,
						path: projectName,
						error: `Template not found: ${gitTemplate}`,
					};
				}

				// Determine which packages to clone
				const packagesToClone = ["api", "ui"];
				if (includeHost) packagesToClone.push("host");
				if (includeGateway) packagesToClone.push("gateway");

				// Clone template using sparse checkout
				await cloneTemplate(gitTemplate, destDir, packagesToClone);

				// Remove excluded files/directories
				const excludedPaths = [
					"database.db",
					".bos",
					".turbo",
					".env",
					".env.bos",
					".env.bos.example",
				];

				// Add host/gateway to exclusions if not requested
				if (!includeHost) excludedPaths.push("host");
				if (!includeGateway) excludedPaths.push("gateway");

				for (const excluded of excludedPaths) {
					try {
						await rm(join(destDir, excluded), { recursive: true, force: true });
					} catch {
						// Ignore errors
					}
				}

				// Generate bos.config.json
				const bosConfig: Record<string, unknown> = {
					extends: templateUrl,
					account: account,
					app: {
						ui: {
							name: "ui",
							development: "http://localhost:3002",
						},
						api: {
							name: "api",
							development: "http://localhost:3014",
							variables: {},
							secrets: [],
						},
					},
				};

				// Only add testnet if provided
				if (testnet) {
					bosConfig.testnet = testnet;
				}

				await writeFile(
					join(destDir, "bos.config.json"),
					JSON.stringify(bosConfig, null, 2),
				);

				// Generate .env.example with secrets from parent config
				const envExample = await generateEnvExample(parentConfig);
				await writeFile(join(destDir, ".env.example"), envExample);

				// Modify package.json to update workspaces
				try {
					const pkgJsonPath = join(destDir, "package.json");
					const pkgJsonContent = await Bun.file(pkgJsonPath).text();
					const pkgJson = JSON.parse(pkgJsonContent);

					// Update workspaces to only include cloned packages
					pkgJson.workspaces.packages = packagesToClone;

					// Remove host/gateway scripts if not included
					if (!includeHost) {
						delete pkgJson.scripts["dev:host"];
						delete pkgJson.scripts["build:host"];
					}
					if (!includeGateway) {
						delete pkgJson.scripts["docker:build"];
						delete pkgJson.scripts["docker:run"];
						delete pkgJson.scripts["docker:stop"];
					}

					await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
				} catch {
					// Package.json might not exist, skip
				}

				// Run sync to update dependencies
				try {
					const { syncFiles } = await import("./lib/sync");
					const catalog = parentConfig.shared?.ui || {};
					await syncFiles({
						configDir: destDir,
						packages: packagesToClone,
						bosConfig: parentConfig,
						catalog,
					});
				} catch {
					// Sync might fail, continue anyway
				}

				return {
					status: "created" as const,
					path: projectName,
				};
			} catch (error) {
				// Cleanup on error
				try {
					await rm(destDir, { recursive: true, force: true });
				} catch {
					// Ignore cleanup errors
				}

				return {
					status: "error" as const,
					path: projectName,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		info: builder.info.handler(async () => {
			const config = deps.bosConfig;
			const packages = config ? Object.keys(config.app) : [];
			const remotes = packages.filter((k) => k !== "host");

			return {
				config: config as any,
				packages,
				remotes,
			};
		}),

		status: builder.status.handler(async ({ input }) => {
			const config = deps.bosConfig;

			if (!config) {
				return { endpoints: [] };
			}

			const host = config.app.host;
			const remotes = Object.keys(config.app).filter((k) => k !== "host");
			const env = input.env;

			interface Endpoint {
				name: string;
				url: string;
				type: "host" | "remote" | "ssr";
				healthy: boolean;
				latency?: number;
			}

			const endpoints: Endpoint[] = [];

			const checkHealth = async (
				url: string,
			): Promise<{ healthy: boolean; latency?: number }> => {
				const start = Date.now();
				try {
					const response = await fetch(url, { method: "HEAD" });
					return {
						healthy: response.ok,
						latency: Date.now() - start,
					};
				} catch {
					return { healthy: false };
				}
			};

			const hostHealth = await checkHealth(host[env]);
			endpoints.push({
				name: "host",
				url: host[env],
				type: "host",
				...hostHealth,
			});

			for (const name of remotes) {
				const remote = config.app[name];
				if (!remote || !("name" in remote)) continue;

				const remoteHealth = await checkHealth(remote[env]);
				endpoints.push({
					name,
					url: remote[env],
					type: "remote",
					...remoteHealth,
				});

				if ((remote as any).ssr && env === "production") {
					const ssrHealth = await checkHealth((remote as any).ssr);
					endpoints.push({
						name: `${name}/ssr`,
						url: (remote as any).ssr,
						type: "ssr",
						...ssrHealth,
					});
				}
			}

			return { endpoints };
		}),

		clean: builder.clean.handler(async () => {
			const { configDir } = deps;
			const packages = deps.bosConfig ? Object.keys(deps.bosConfig.app) : [];
			const removed: string[] = [];

			for (const pkg of packages) {
				const distPath = `${configDir}/${pkg}/dist`;
				try {
					await Bun.spawn(["rm", "-rf", distPath]).exited;
					removed.push(`${pkg}/dist`);
				} catch {}

				const nodeModulesPath = `${configDir}/${pkg}/node_modules`;
				try {
					await Bun.spawn(["rm", "-rf", nodeModulesPath]).exited;
					removed.push(`${pkg}/node_modules`);
				} catch {}
			}

			return {
				status: "cleaned" as const,
				removed,
			};
		}),

		register: builder.register.handler(async ({ input }) => {
			const { bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					account: input.name,
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const network = input.network;

			try {
				const parentAccount = getAccountForNetwork(bosConfig, network);
				const fullAccount = `${input.name}.${parentAccount}`;

				const registerEffect = Effect.gen(function* () {
					yield* ensureNearCli;

					const bosEnv = yield* loadBosEnv;
					const gatewayPrivateKey = bosEnv.GATEWAY_PRIVATE_KEY;

					yield* createSubaccount({
						newAccount: fullAccount,
						parentAccount,
						initialBalance: "0.1NEAR",
						network,
						privateKey: gatewayPrivateKey,
					});

					const novaConfig = yield* getNovaConfig;
					const nova = createNovaClient(novaConfig);

					const gatewayNovaAccount = bosConfig.gateway?.nova?.account;
					if (!gatewayNovaAccount) {
						return yield* Effect.fail(
							new Error(
								"gateway.nova.account is required for secrets registration",
							),
						);
					}

					yield* registerSecretsGroup(nova, fullAccount, gatewayNovaAccount);

					return {
						status: "registered" as const,
						account: fullAccount,
						novaGroup: getSecretsGroupId(fullAccount),
					};
				});

				return await Effect.runPromise(registerEffect);
			} catch (error) {
				const parentAccount =
					network === "testnet" ? bosConfig.testnet : bosConfig.account;
				return {
					status: "error" as const,
					account: `${input.name}.${parentAccount || bosConfig.account}`,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		secretsSync: builder.secretsSync.handler(async ({ input }) => {
			const { bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					count: 0,
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const syncEffect = Effect.gen(function* () {
				const novaConfig = yield* getNovaConfig;
				const nova = createNovaClient(novaConfig);
				const groupId = getSecretsGroupId(bosConfig.account);

				const envContent = yield* Effect.tryPromise({
					try: () => Bun.file(input.envPath).text(),
					catch: (e) => new Error(`Failed to read env file: ${e}`),
				});

				const secrets = parseEnvFile(envContent);
				const result = yield* uploadSecrets(nova, groupId, secrets);

				return {
					status: "synced" as const,
					count: Object.keys(secrets).length,
					cid: result.cid,
				};
			});

			try {
				return await Effect.runPromise(syncEffect);
			} catch (error) {
				return {
					status: "error" as const,
					count: 0,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		secretsSet: builder.secretsSet.handler(async ({ input }) => {
			const { bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const setEffect = Effect.gen(function* () {
				const novaConfig = yield* getNovaConfig;
				const nova = createNovaClient(novaConfig);
				const groupId = getSecretsGroupId(bosConfig.account);

				const result = yield* uploadSecrets(nova, groupId, {
					[input.key]: input.value,
				});

				return {
					status: "set" as const,
					cid: result.cid,
				};
			});

			try {
				return await Effect.runPromise(setEffect);
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		secretsList: builder.secretsList.handler(async () => {
			const { bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					keys: [],
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const listEffect = Effect.gen(function* () {
				const novaConfig = yield* getNovaConfig;
				const nova = createNovaClient(novaConfig);
				const groupId = getSecretsGroupId(bosConfig.account);

				const bosEnv = yield* loadBosEnv;
				const cid = bosEnv.NOVA_SECRETS_CID;

				if (!cid) {
					return {
						status: "listed" as const,
						keys: [] as string[],
					};
				}

				const secretsData = yield* retrieveSecrets(nova, groupId, cid);

				return {
					status: "listed" as const,
					keys: Object.keys(secretsData.secrets),
				};
			});

			try {
				return await Effect.runPromise(listEffect);
			} catch (error) {
				return {
					status: "error" as const,
					keys: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		secretsDelete: builder.secretsDelete.handler(async ({ input }) => {
			const { bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const deleteEffect = Effect.gen(function* () {
				const novaConfig = yield* getNovaConfig;
				const nova = createNovaClient(novaConfig);
				const groupId = getSecretsGroupId(bosConfig.account);

				const bosEnv = yield* loadBosEnv;
				const cid = bosEnv.NOVA_SECRETS_CID;

				if (!cid) {
					return yield* Effect.fail(
						new Error("No secrets found to delete from"),
					);
				}

				const secretsData = yield* retrieveSecrets(nova, groupId, cid);
				const { [input.key]: _, ...remainingSecrets } = secretsData.secrets;

				const result = yield* uploadSecrets(nova, groupId, remainingSecrets);

				return {
					status: "deleted" as const,
					cid: result.cid,
				};
			});

			try {
				return await Effect.runPromise(deleteEffect);
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		login: builder.login.handler(async ({ input }) => {
			const loginEffect = Effect.gen(function* () {
				const { token, accountId } = input;

				if (!token || !accountId) {
					return yield* Effect.fail(
						new Error("Both token and accountId are required"),
					);
				}

				yield* verifyNovaCredentials(accountId, token);
				yield* saveNovaCredentials(accountId, token);

				return {
					status: "logged-in" as const,
					accountId,
				};
			});

			try {
				return await Effect.runPromise(loginEffect);
			} catch (error) {
				let message = "Unknown error";
				if (error instanceof Error) {
					message = error.message;
				} else if (typeof error === "object" && error !== null) {
					if ("message" in error) {
						message = String(error.message);
					} else if ("_tag" in error && "error" in error) {
						const inner = (error as { error: unknown }).error;
						message = inner instanceof Error ? inner.message : String(inner);
					} else {
						message = JSON.stringify(error);
					}
				} else {
					message = String(error);
				}
				console.error("Login error details:", error);
				return {
					status: "error" as const,
					error: message,
				};
			}
		}),

		logout: builder.logout.handler(async () => {
			const logoutEffect = Effect.gen(function* () {
				yield* removeNovaCredentials;

				return {
					status: "logged-out" as const,
				};
			});

			try {
				return await Effect.runPromise(logoutEffect);
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		gatewayDev: builder.gatewayDev.handler(async () => {
			const { configDir } = deps;
			const gatewayDir = `${configDir}/gateway`;

			const devEffect = Effect.gen(function* () {
				const { execa } = yield* Effect.tryPromise({
					try: () => import("execa"),
					catch: (e) => new Error(`Failed to import execa: ${e}`),
				});

				const subprocess = execa("npx", ["wrangler", "dev"], {
					cwd: gatewayDir,
					stdio: "inherit",
				});

				subprocess.catch(() => {});

				return {
					status: "started" as const,
					url: "http://localhost:8787",
				};
			});

			try {
				return await Effect.runPromise(devEffect);
			} catch (error) {
				return {
					status: "error" as const,
					url: "",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		gatewayDeploy: builder.gatewayDeploy.handler(async ({ input }) => {
			const { configDir, bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					url: "",
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const gatewayDir = `${configDir}/gateway`;

			const deployEffect = Effect.gen(function* () {
				const { execa } = yield* Effect.tryPromise({
					try: () => import("execa"),
					catch: (e) => new Error(`Failed to import execa: ${e}`),
				});

				const args = ["wrangler", "deploy"];
				if (input.env) {
					args.push("--env", input.env);
				}

				yield* Effect.tryPromise({
					try: () =>
						execa("npx", args, {
							cwd: gatewayDir,
							stdio: "inherit",
						}),
					catch: (e) => new Error(`Deploy failed: ${e}`),
				});

				const gatewayDomain = getGatewayDomain(bosConfig);
				const domain =
					input.env === "staging" ? `staging.${gatewayDomain}` : gatewayDomain;

				return {
					status: "deployed" as const,
					url: `https://${domain}`,
				};
			});

			try {
				return await Effect.runPromise(deployEffect);
			} catch (error) {
				return {
					status: "error" as const,
					url: "",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		gatewaySync: builder.gatewaySync.handler(async () => {
			const { configDir, bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const wranglerPath = `${configDir}/gateway/wrangler.toml`;

			try {
				const gatewayDomain = getGatewayDomain(bosConfig);
				const gatewayAccount = bosConfig.gateway?.account || bosConfig.account;

				const wranglerContent = await Bun.file(wranglerPath).text();

				let updatedContent = wranglerContent.replace(
					/GATEWAY_DOMAIN\s*=\s*"[^"]*"/g,
					`GATEWAY_DOMAIN = "${gatewayDomain}"`,
				);
				updatedContent = updatedContent.replace(
					/GATEWAY_ACCOUNT\s*=\s*"[^"]*"/g,
					`GATEWAY_ACCOUNT = "${gatewayAccount}"`,
				);

				await Bun.write(wranglerPath, updatedContent);

				return {
					status: "synced" as const,
					gatewayDomain,
					gatewayAccount,
				};
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		depsUpdate: builder.depsUpdate.handler(async ({ input }) => {
			const { configDir, bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					updated: [],
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const category = input.category;
			const sharedDeps = bosConfig.shared?.[category];

			if (!sharedDeps || Object.keys(sharedDeps).length === 0) {
				return {
					status: "error" as const,
					updated: [],
					error: `No shared.${category} dependencies found in bos.config.json`,
				};
			}

			const { mkdtemp, rm } = await import("fs/promises");
			const { tmpdir } = await import("os");
			const { join } = await import("path");
			const { execa } = await import("execa");

			const tempDir = await mkdtemp(join(tmpdir(), "bos-deps-"));

			try {
				const tempDeps: Record<string, string> = {};
				for (const [name, config] of Object.entries(sharedDeps)) {
					const version =
						(config as { requiredVersion?: string }).requiredVersion || "*";
					tempDeps[name] = version.replace(/^[\^~]/, "");
				}

				const tempPkg = {
					name: "bos-deps-update",
					private: true,
					dependencies: tempDeps,
				};

				await Bun.write(
					join(tempDir, "package.json"),
					JSON.stringify(tempPkg, null, 2),
				);

				await execa("bun", ["install"], {
					cwd: tempDir,
					stdio: "inherit",
				});

				await execa("bun", ["update", "-i"], {
					cwd: tempDir,
					stdio: "inherit",
				});

				const updatedPkg = (await Bun.file(
					join(tempDir, "package.json"),
				).json()) as {
					dependencies: Record<string, string>;
				};

				const updated: { name: string; from: string; to: string }[] = [];
				const updatedConfig = { ...bosConfig };

				if (!updatedConfig.shared) {
					updatedConfig.shared = {};
				}
				if (!updatedConfig.shared[category]) {
					updatedConfig.shared[category] = {};
				}

				for (const [name, newVersion] of Object.entries(
					updatedPkg.dependencies,
				)) {
					const oldVersion =
						(sharedDeps[name] as { requiredVersion?: string })
							?.requiredVersion || "";
					if (newVersion !== oldVersion) {
						updated.push({ name, from: oldVersion, to: newVersion });
						updatedConfig.shared[category][name] = {
							...(sharedDeps[name] as object),
							requiredVersion: newVersion,
						};
					}
				}

				if (updated.length > 0) {
					const bosConfigPath = `${configDir}/bos.config.json`;
					await Bun.write(
						bosConfigPath,
						JSON.stringify(updatedConfig, null, 2),
					);

					const rootPkgPath = `${configDir}/package.json`;
					const rootPkg = (await Bun.file(rootPkgPath).json()) as {
						workspaces?: { catalog?: Record<string, string> };
					};

					if (rootPkg.workspaces?.catalog) {
						for (const { name, to } of updated) {
							rootPkg.workspaces.catalog[name] = to;
						}
						await Bun.write(rootPkgPath, JSON.stringify(rootPkg, null, 2));
					}

					await execa("bun", ["install"], {
						cwd: configDir,
						stdio: "inherit",
					});

					return {
						status: "updated" as const,
						updated,
						syncStatus: "synced" as const,
					};
				}

				return {
					status: "cancelled" as const,
					updated: [],
				};
			} catch (error) {
				return {
					status: "error" as const,
					updated: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		}),

		filesSync: builder.filesSync.handler(async ({ input }) => {
			const { configDir, bosConfig } = deps;

			if (!bosConfig) {
				return {
					status: "error" as const,
					synced: [],
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			const rootPkgPath = `${configDir}/package.json`;
			const rootPkg = (await Bun.file(rootPkgPath).json()) as {
				workspaces?: { catalog?: Record<string, string> };
			};
			const catalog = rootPkg.workspaces?.catalog ?? {};

			const packages = input.packages || Object.keys(bosConfig.app);

			const synced = await syncFiles({
				configDir,
				packages,
				bosConfig,
				catalog,
				force: input.force,
			});

			return {
				status: "synced" as const,
				synced,
			};
		}),

		update: builder.update.handler(async ({ input }) => {
			const { configDir, bosConfig } = deps;

			const DEFAULT_ACCOUNT = "every.near";

			const account = input.account || bosConfig?.account || DEFAULT_ACCOUNT;
			const gateway = input.gateway || getGatewayDomain(bosConfig);
			const socialUrl = `https://near.social/mob.near/widget/State.Inspector?key=${account}/bos/gateways/${gateway}`;

			if (!bosConfig) {
				return {
					status: "error" as const,
					account,
					gateway,
					socialUrl,
					hostUrl: "",
					catalogUpdated: false,
					packagesUpdated: [],
					error: "No bos.config.json found. Run from a BOS project directory.",
				};
			}

			try {
				const graph = new Graph();
				const configPath = `${account}/bos/gateways/${gateway}/bos.config.json`;

				let remoteConfig: BosConfigType | null = null;

				const data = await graph.get({ keys: [configPath] });
				if (data) {
					const parts = configPath.split("/");
					let current: unknown = data;
					for (const part of parts) {
						if (current && typeof current === "object" && part in current) {
							current = (current as Record<string, unknown>)[part];
						} else {
							current = null;
							break;
						}
					}
					if (typeof current === "string") {
						remoteConfig = JSON.parse(current) as BosConfigType;
					}
				}

				if (!remoteConfig) {
					return {
						status: "error" as const,
						account,
						gateway,
						hostUrl: "",
						catalogUpdated: false,
						packagesUpdated: [],
						error: `No config found at ${configPath} on Near Social. Run 'bos publish' first.`,
					};
				}

				const hostUrl = remoteConfig.app?.host?.production;
				if (!hostUrl) {
					return {
						status: "error" as const,
						account,
						gateway,
						hostUrl: "",
						catalogUpdated: false,
						packagesUpdated: [],
						error: `Published config is missing 'app.host.production'. Republish with updated bos.config.json.`,
					};
				}

				const mergeAppConfig = (
					localApp: Record<string, unknown>,
					remoteApp: Record<string, unknown>,
				): Record<string, unknown> => {
					const merged: Record<string, unknown> = {};

					for (const key of Object.keys(remoteApp)) {
						const local = localApp[key] as Record<string, unknown> | undefined;
						const remote = remoteApp[key] as Record<string, unknown>;

						if (!local) {
							merged[key] = remote;
							continue;
						}

						merged[key] = {
							...remote,
							development: local.development,
							secrets: [
								...new Set([
									...((remote.secrets as string[]) || []),
									...((local.secrets as string[]) || []),
								]),
							],
							variables: {
								...((remote.variables as Record<string, unknown>) || {}),
								...((local.variables as Record<string, unknown>) || {}),
							},
						};
					}

					return merged;
				};

				const updatedBosConfig: BosConfigType = {
					account: bosConfig.account,
					testnet: bosConfig.testnet,
					template: remoteConfig.template,
					shared: remoteConfig.shared,
					gateway: remoteConfig.gateway,
					app: mergeAppConfig(
						bosConfig.app as Record<string, unknown>,
						remoteConfig.app as Record<string, unknown>,
					) as BosConfigType["app"],
				};

				const bosConfigPath = `${configDir}/bos.config.json`;
				await Bun.write(
					bosConfigPath,
					JSON.stringify(updatedBosConfig, null, 2),
				);
				// Config is written to disk, subsequent code uses updatedBosConfig directly
				// Cache will be refreshed on next loadConfig() call

				const sharedUiDeps: Record<string, string> = {};
				const sharedUi = updatedBosConfig.shared?.ui as
					| Record<string, { requiredVersion?: string }>
					| undefined;
				if (sharedUi) {
					for (const [name, config] of Object.entries(sharedUi)) {
						if (config.requiredVersion) {
							sharedUiDeps[name] = config.requiredVersion;
						}
					}
				}

				const rootPkgPath = `${configDir}/package.json`;
				const rootPkg = (await Bun.file(rootPkgPath).json()) as {
					workspaces: { packages: string[]; catalog: Record<string, string> };
					[key: string]: unknown;
				};

				rootPkg.workspaces.catalog = {
					...rootPkg.workspaces.catalog,
					...sharedUiDeps,
				};
				await Bun.write(rootPkgPath, JSON.stringify(rootPkg, null, 2));

				const packages = ["host", "ui", "api"];
				const packagesUpdated: string[] = [];

				for (const pkg of packages) {
					const pkgDir = `${configDir}/${pkg}`;
					const pkgDirExists = await Bun.file(
						`${pkgDir}/package.json`,
					).exists();
					if (!pkgDirExists) continue;

					const pkgPath = `${pkgDir}/package.json`;
					const pkgFile = Bun.file(pkgPath);

					const pkgJson = (await pkgFile.json()) as {
						dependencies?: Record<string, string>;
						devDependencies?: Record<string, string>;
						peerDependencies?: Record<string, string>;
					};

					let updated = false;

					for (const depType of [
						"dependencies",
						"devDependencies",
						"peerDependencies",
					] as const) {
						const deps = pkgJson[depType];
						if (!deps) continue;

						for (const [name, version] of Object.entries(deps)) {
							if (
								name in rootPkg.workspaces.catalog &&
								version !== "catalog:"
							) {
								deps[name] = "catalog:";
								updated = true;
							}
						}
					}

					if (updated || input.force) {
						await Bun.write(pkgPath, JSON.stringify(pkgJson, null, 2));
						packagesUpdated.push(pkg);
					}
				}

				const results = await syncFiles({
					configDir,
					packages: Object.keys(updatedBosConfig.app),
					bosConfig: updatedBosConfig,
					catalog: rootPkg.workspaces?.catalog ?? {},
					force: input.force,
				});

				const filesSynced =
					results.length > 0
						? results.map((r) => ({ package: r.package, files: r.files }))
						: undefined;

				return {
					status: "updated" as const,
					account,
					gateway,
					socialUrl,
					hostUrl,
					catalogUpdated: true,
					packagesUpdated,
					filesSynced,
				};
			} catch (error) {
				return {
					status: "error" as const,
					account,
					gateway,
					hostUrl: "",
					catalogUpdated: false,
					packagesUpdated: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		kill: builder.kill.handler(async ({ input }) => {
			const killEffect = Effect.gen(function* () {
				const registry = yield* createProcessRegistry();
				const result = yield* registry.killAll(input.force);
				return {
					status: "killed" as const,
					killed: result.killed,
					failed: result.failed,
				};
			});

			try {
				return await Effect.runPromise(killEffect);
			} catch (error) {
				return {
					status: "error" as const,
					killed: [],
					failed: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		ps: builder.ps.handler(async () => {
			const psEffect = Effect.gen(function* () {
				const registry = yield* createProcessRegistry();
				const processes = yield* registry.getAll();
				return {
					status: "listed" as const,
					processes,
				};
			});

			try {
				return await Effect.runPromise(psEffect);
			} catch (error) {
				return {
					status: "error" as const,
					processes: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		dockerBuild: builder.dockerBuild.handler(async ({ input }) => {
			const { configDir, bosConfig } = deps;

			const dockerEffect = Effect.gen(function* () {
				const { execa } = yield* Effect.tryPromise({
					try: () => import("execa"),
					catch: (e) => new Error(`Failed to import execa: ${e}`),
				});

				const dockerfile =
					input.target === "development" ? "Dockerfile.dev" : "Dockerfile";
				const imageName = bosConfig?.account?.replace(/\./g, "-") || "bos-app";
				const tag =
					input.tag || (input.target === "development" ? "dev" : "latest");
				const fullTag = `${imageName}:${tag}`;

				const args = ["build", "-f", dockerfile, "-t", fullTag];
				if (input.noCache) {
					args.push("--no-cache");
				}
				args.push(".");

				yield* Effect.tryPromise({
					try: () =>
						execa("docker", args, {
							cwd: configDir,
							stdio: "inherit",
						}),
					catch: (e) => new Error(`Docker build failed: ${e}`),
				});

				return {
					status: "built" as const,
					image: imageName,
					tag: fullTag,
				};
			});

			try {
				return await Effect.runPromise(dockerEffect);
			} catch (error) {
				return {
					status: "error" as const,
					image: "",
					tag: "",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		dockerRun: builder.dockerRun.handler(async ({ input }) => {
			const { bosConfig } = deps;

			const dockerEffect = Effect.gen(function* () {
				const { execa } = yield* Effect.tryPromise({
					try: () => import("execa"),
					catch: (e) => new Error(`Failed to import execa: ${e}`),
				});

				const imageName = bosConfig?.account?.replace(/\./g, "-") || "bos-app";
				const tag = input.target === "development" ? "dev" : "latest";
				const fullTag = `${imageName}:${tag}`;
				const port =
					input.port || (input.target === "development" ? 4000 : 3000);

				const args = ["run"];

				if (input.detach) {
					args.push("-d");
				}

				args.push("-p", `${port}:${port}`);
				args.push("-e", `PORT=${port}`);

				if (input.target === "development") {
					args.push("-e", `MODE=${input.mode}`);
				}

				if (input.env) {
					for (const [key, value] of Object.entries(input.env)) {
						args.push("-e", `${key}=${value}`);
					}
				}

				if (bosConfig) {
					args.push("-e", `BOS_ACCOUNT=${bosConfig.account}`);
					const gateway = bosConfig.gateway as
						| { production?: string }
						| string
						| undefined;
					if (gateway) {
						const domain =
							typeof gateway === "string"
								? gateway
								: gateway.production?.replace(/^https?:\/\//, "") || "";
						if (domain) {
							args.push("-e", `GATEWAY_DOMAIN=${domain}`);
						}
					}
				}

				args.push(fullTag);

				const result = yield* Effect.tryPromise({
					try: () =>
						execa("docker", args, {
							stdio: input.detach ? "pipe" : "inherit",
						}),
					catch: (e) => new Error(`Docker run failed: ${e}`),
				});

				const containerId =
					input.detach && result.stdout
						? result.stdout.trim().slice(0, 12)
						: "attached";

				return {
					status: "running" as const,
					containerId,
					url: `http://localhost:${port}`,
				};
			});

			try {
				return await Effect.runPromise(dockerEffect);
			} catch (error) {
				return {
					status: "error" as const,
					containerId: "",
					url: "",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		dockerStop: builder.dockerStop.handler(async ({ input }) => {
			const { bosConfig } = deps;

			const dockerEffect = Effect.gen(function* () {
				const { execa } = yield* Effect.tryPromise({
					try: () => import("execa"),
					catch: (e) => new Error(`Failed to import execa: ${e}`),
				});

				const stopped: string[] = [];

				if (input.containerId) {
					yield* Effect.tryPromise({
						try: () => execa("docker", ["stop", input.containerId!]),
						catch: (e) => new Error(`Failed to stop container: ${e}`),
					});
					stopped.push(input.containerId!);
				} else if (input.all) {
					const imageName =
						bosConfig?.account?.replace(/\./g, "-") || "bos-app";

					const psResult = yield* Effect.tryPromise({
						try: () =>
							execa("docker", [
								"ps",
								"-q",
								"--filter",
								`ancestor=${imageName}`,
							]),
						catch: () => new Error("Failed to list containers"),
					});

					const containerIds = psResult.stdout
						.trim()
						.split("\n")
						.filter(Boolean);

					for (const id of containerIds) {
						yield* Effect.tryPromise({
							try: () => execa("docker", ["stop", id]),
							catch: () => new Error(`Failed to stop container ${id}`),
						}).pipe(Effect.catchAll(() => Effect.void));
						stopped.push(id);
					}
				}

				return {
					status: "stopped" as const,
					stopped,
				};
			});

			try {
				return await Effect.runPromise(dockerEffect);
			} catch (error) {
				return {
					status: "error" as const,
					stopped: [],
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		monitor: builder.monitor.handler(async ({ input }) => {
			try {
				if (input.json) {
					const snapshot = await runWithInfo(
						createSnapshotWithPlatform(
							input.ports ? { ports: input.ports } : undefined,
						),
					);
					return {
						status: "snapshot" as const,
						snapshot: snapshot as any,
					};
				}

				if (input.watch) {
					runMonitorCli({ ports: input.ports, json: false });
					return {
						status: "watching" as const,
					};
				}

				const snapshot = await runWithInfo(
					createSnapshotWithPlatform(
						input.ports ? { ports: input.ports } : undefined,
					),
				);
				console.log(formatSnapshotSummary(snapshot));

				return {
					status: "snapshot" as const,
					snapshot: snapshot as any,
				};
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

		session: builder.session.handler(async ({ input }) => {
			const sessionEffect = Effect.gen(function* () {
				const recorder = yield* SessionRecorder.create({
					ports: [3000],
					snapshotIntervalMs: input.snapshotInterval,
					headless: input.headless,
					baseUrl: "http://localhost:3000",
					timeout: input.timeout,
				});

				try {
					yield* recorder.startServers("start");

					yield* recorder.startRecording();

					const browser = yield* recorder.launchBrowser();

					if (input.flow === "login") {
						yield* runLoginFlow(
							browser,
							{
								recordEvent: (type, label, metadata) =>
									recorder.recordEvent(type, label, metadata).pipe(
										Effect.asVoid,
										Effect.catchAll(() => Effect.void),
									),
							},
							{
								baseUrl: "http://localhost:3000",
								headless: input.headless,
								stubWallet: input.headless,
								timeout: 30000,
							},
						);
					} else if (input.flow === "navigation" && input.routes) {
						yield* runNavigationFlow(
							browser,
							{
								recordEvent: (type, label, metadata) =>
									recorder.recordEvent(type, label, metadata).pipe(
										Effect.asVoid,
										Effect.catchAll(() => Effect.void),
									),
							},
							input.routes,
							"http://localhost:3000",
						);
					} else {
						yield* navigateTo(browser.page, "http://localhost:3000");
						yield* Effect.sleep("5 seconds");
					}

					yield* recorder.cleanup();

					const report = yield* recorder.stopRecording();

					yield* recorder.exportReport(input.output, input.format);

					console.log(formatReportSummary(report));

					return {
						status: report.summary.hasLeaks
							? ("leaks_detected" as const)
							: ("completed" as const),
						sessionId: recorder.getSessionId(),
						reportPath: input.output,
						summary: {
							totalMemoryDeltaMb: report.summary.totalMemoryDeltaMb,
							peakMemoryMb: report.summary.peakMemoryMb,
							averageMemoryMb: report.summary.averageMemoryMb,
							processesSpawned: report.summary.processesSpawned,
							processesKilled: report.summary.processesKilled,
							orphanedProcesses: report.summary.orphanedProcesses,
							portsUsed: report.summary.portsUsed,
							portsLeaked: report.summary.portsLeaked,
							hasLeaks: report.summary.hasLeaks,
							eventCount: report.summary.eventCount,
							duration: report.summary.duration,
						},
					};
				} catch (error) {
					yield* recorder.cleanup();
					throw error;
				}
			});

			try {
				return await Effect.runPromise(sessionEffect);
			} catch (error) {
				return {
					status: "error" as const,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),
	}),
});
