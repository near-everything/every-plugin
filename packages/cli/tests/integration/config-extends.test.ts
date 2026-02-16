import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearConfigCache,
	findConfigPath,
	getConfig,
	getProjectRoot,
	loadConfig,
	resolvePackages,
} from "../../src/config";
import type { BosConfig } from "../../src/types";
import {
	ConfigCircularExtendsError,
	ConfigFetchError,
	ConfigResolutionError,
} from "../../src/types";

describe("Config Extends Integration", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "bos-config-integration-"));
		clearConfigCache();
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
		clearConfigCache();
	});

	describe("Real BOS URL extends (every.near/everything.dev)", () => {
		it("end-to-end: child extends BOS parent", async () => {
			const childDir = join(tempDir, "bos-child");
			await mkdir(childDir, { recursive: true });

			// Create child config that extends the real every.near/everything.dev
			const childConfig = {
				extends: "bos://every.near/everything.dev",
				account: "myapp.near",
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://myapp.near",
					},
					// Override UI to use custom development URL
					ui: {
						name: "ui",
						development: "http://localhost:3003", // Override
						// production should be inherited from parent
					},
				},
			};

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(childConfig, null, 2),
			);

			// Load the config - this will actually fetch from NEAR Social
			console.log("Fetching parent config from NEAR Social...");
			const result = await loadConfig({ cwd: childDir });

			expect(result).not.toBeNull();
			expect(result?.config.account).toBe("myapp.near"); // Child value
			expect(result?.source.extended).toContain(
				"bos://every.near/everything.dev",
			);

			// Inherited from every.near/everything.dev
			expect(result?.config.gateway).toBeDefined();
			expect(result?.config.app.host).toBeDefined();

			// UI should have merged values
			expect(result?.config.app.ui.development).toBe("http://localhost:3003"); // Child override
			// production should come from parent
			expect(result?.config.app.ui.production).toBeDefined();
		}, 15000); // 15 second timeout for network request

		it("end-to-end: complex inheritance chain", async () => {
			// Create grandparent locally
			const grandparentDir = join(tempDir, "integration-grandparent");
			await mkdir(grandparentDir, { recursive: true });
			await writeFile(
				join(grandparentDir, "bos.config.json"),
				JSON.stringify({
					account: "grandparent.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://gp.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://gp.near",
						},
						ui: {
							name: "ui",
							development: "http://localhost:3002",
							production: "https://ui.gp.near",
						},
					},
				}),
			);

			// Create parent that extends grandparent locally + BOS URL
			const parentDir = join(tempDir, "integration-parent");
			await mkdir(parentDir, { recursive: true });
			await writeFile(
				join(parentDir, "bos.config.json"),
				JSON.stringify({
					extends: "../integration-grandparent/bos.config.json",
					account: "parent.near",
					app: {
						api: {
							name: "api",
							development: "http://localhost:3014",
							production: "https://api.parent.near",
						},
					},
				}),
			);

			// Create child that extends parent (local → BOS chain)
			const childDir = join(tempDir, "integration-child");
			await mkdir(childDir, { recursive: true });
			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify({
					extends: "../integration-parent/bos.config.json",
					account: "child.near",
					app: {
						host: {
							development: "http://localhost:3001", // Override
							production: "https://child.near",
						},
					},
				}),
			);

			const result = await loadConfig({ cwd: childDir });

			expect(result?.config.account).toBe("child.near");
			// From grandparent through parent
			expect(result?.config.gateway.development).toBe("http://localhost:8787");
			// From parent
			expect(result?.config.app.api.development).toBe("http://localhost:3014");
			// From child (overridden)
			expect(result?.config.app.host.development).toBe("http://localhost:3001");
		});
	});

	describe("Error handling", () => {
		it("shows proper error on circular extends", async () => {
			const dirA = join(tempDir, "circular-error-a");
			const dirB = join(tempDir, "circular-error-b");
			await mkdir(dirA, { recursive: true });
			await mkdir(dirB, { recursive: true });

			await writeFile(
				join(dirA, "bos.config.json"),
				JSON.stringify({
					extends: "../circular-error-b/bos.config.json",
					account: "a.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://a.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://a.near",
						},
					},
				}),
			);
			await writeFile(
				join(dirB, "bos.config.json"),
				JSON.stringify({
					extends: "../circular-error-a/bos.config.json",
					account: "b.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://b.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://b.near",
						},
					},
				}),
			);

			try {
				await loadConfig({ cwd: dirA });
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigCircularExtendsError);
				if (error instanceof ConfigCircularExtendsError) {
					expect(error.message).toContain("circular-error-a");
					expect(error.message).toContain("circular-error-b");
				}
			}
		});

		it("throws on missing parent config", async () => {
			const childDir = join(tempDir, "missing-parent");
			await mkdir(childDir, { recursive: true });

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify({
					extends: "../nonexistent/bos.config.json",
					account: "orphan.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://orphan.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://orphan.near",
						},
					},
				}),
			);

			await expect(loadConfig({ cwd: childDir })).rejects.toThrow();
		});

		it("throws on invalid BOS URL format", async () => {
			const childDir = join(tempDir, "invalid-bos");
			await mkdir(childDir, { recursive: true });

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify({
					extends: "invalid://not-a-bos-url",
					account: "invalid.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://invalid.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://invalid.near",
						},
					},
				}),
			);

			await expect(loadConfig({ cwd: childDir })).rejects.toThrow(
				ConfigResolutionError,
			);
		});
	});

	describe("Caching behavior", () => {
		it("uses cache on second load", async () => {
			const configDir = join(tempDir, "cache-test");
			await mkdir(configDir, { recursive: true });

			await writeFile(
				join(configDir, "bos.config.json"),
				JSON.stringify({
					account: "cache.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://cache.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://cache.near",
						},
					},
				}),
			);

			const result1 = await loadConfig({ cwd: configDir });
			const result2 = await loadConfig({ cwd: configDir });

			// Should be same object due to caching
			expect(result1?.config).toBe(result2?.config);
		});

		it("force flag bypasses cache", async () => {
			const configDir = join(tempDir, "force-test");
			await mkdir(configDir, { recursive: true });

			await writeFile(
				join(configDir, "bos.config.json"),
				JSON.stringify({
					account: "force.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://force.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://force.near",
						},
					},
				}),
			);

			const result1 = await loadConfig({ cwd: configDir });
			const result2 = await loadConfig({ cwd: configDir, force: true });

			// Should be different objects
			expect(result1?.config).not.toBe(result2?.config);
			expect(result1?.config.account).toBe(result2?.config.account);
		});
	});
});
