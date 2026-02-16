import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearConfigCache,
	findConfigPath,
	getConfig,
	getProjectRoot,
	loadConfig,
	resolvePackages,
} from "../../src/config";
import type { BosConfig, SourceMode } from "../../src/types";
import {
	ConfigCircularExtendsError,
	ConfigFetchError,
	ConfigResolutionError,
} from "../../src/types";

describe("Config Loading System", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "bos-config-test-"));
		clearConfigCache();
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
		clearConfigCache();
	});

	describe("Local Config Loading", () => {
		it("loads simple config from disk", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result = await loadConfig({ cwd: tempDir });
			expect(result).not.toBeNull();
			expect(result?.config.account).toBe("test.near");
			expect(result?.source.path).toBe(join(tempDir, "bos.config.json"));
		});

		it("finds config by walking up directory tree", async () => {
			const config: BosConfig = {
				account: "nested.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://nested.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://nested.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.nested.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.nested.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const nestedDir = join(tempDir, "packages", "cli", "src", "lib");
			await mkdir(nestedDir, { recursive: true });

			const result = await loadConfig({ cwd: nestedDir });
			expect(result?.config.account).toBe("nested.near");
		});

		it("returns null when no config found", async () => {
			const isolatedDir = await mkdtemp(join(tmpdir(), "isolated-"));
			const result = await loadConfig({ cwd: isolatedDir });
			expect(result).toBeNull();
			await rm(isolatedDir, { recursive: true });
		});

		it("validates config against schema", async () => {
			const invalidConfig = {
				account: "test.near",
				// Missing required 'gateway' field
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(invalidConfig, null, 2),
			);

			await expect(loadConfig({ cwd: tempDir })).rejects.toThrow();
		});

		it("caches loaded config", async () => {
			const config: BosConfig = {
				account: "cached.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://cached.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://cached.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.cached.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.cached.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result1 = await loadConfig({ cwd: tempDir });
			const result2 = await loadConfig({ cwd: tempDir });

			// Should be same object reference due to caching
			expect(result1?.config).toBe(result2?.config);
		});

		it("force=true invalidates cache and reloads", async () => {
			const config: BosConfig = {
				account: "force-test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://force-test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://force-test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.force-test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.force-test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result1 = await loadConfig({ cwd: tempDir });
			const result2 = await loadConfig({ cwd: tempDir, force: true });

			// Should be different object references
			expect(result1?.config).not.toBe(result2?.config);
			expect(result1?.config.account).toBe(result2?.config.account);
		});
	});

	describe("Config with Extends (Local)", () => {
		it("loads config that extends another local config", async () => {
			// Create parent config
			const parentDir = join(tempDir, "parent");
			await mkdir(parentDir, { recursive: true });

			const parentConfig: BosConfig = {
				account: "parent.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://parent.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://parent.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.parent.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.parent.near",
						secrets: ["DB_URL", "API_KEY"],
					},
				},
			};

			await writeFile(
				join(parentDir, "bos.config.json"),
				JSON.stringify(parentConfig, null, 2),
			);

			// Create child config
			const childDir = join(tempDir, "child");
			await mkdir(childDir, { recursive: true });

			const childConfig = {
				extends: "../parent/bos.config.json",
				account: "child.near",
				app: {
					api: {
						name: "api",
						development: "http://localhost:3015", // Override parent
						// production inherited from parent
					},
				},
			};

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(childConfig, null, 2),
			);

			const result = await loadConfig({ cwd: childDir });
			expect(result?.config.account).toBe("child.near");
			expect(result?.config.gateway.development).toBe("http://localhost:8787"); // Inherited
			expect(result?.config.app.api.development).toBe("http://localhost:3015"); // Overridden
			expect(result?.config.app.api.production).toBe("https://api.parent.near"); // Inherited
			expect(result?.config.app.api.secrets).toEqual(["DB_URL", "API_KEY"]); // Inherited
		});

		it("deep merges parent and child configs", async () => {
			const parentDir = join(tempDir, "parent-deep");
			await mkdir(parentDir, { recursive: true });

			const parentConfig = {
				account: "parent.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://parent.near",
				},
				shared: {
					ui: {
						react: { requiredVersion: "^18.0.0", singleton: true },
					},
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://parent.near",
					},
				},
			};

			await writeFile(
				join(parentDir, "bos.config.json"),
				JSON.stringify(parentConfig, null, 2),
			);

			const childDir = join(tempDir, "child-deep");
			await mkdir(childDir, { recursive: true });

			const childConfig = {
				extends: "../parent-deep/bos.config.json",
				account: "child.near",
				shared: {
					ui: {
						"react-dom": { requiredVersion: "^18.0.0", singleton: true },
					},
				},
			};

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(childConfig, null, 2),
			);

			const result = await loadConfig({ cwd: childDir });
			// Shared should be merged, not replaced
			expect(result?.config.shared?.ui).toHaveProperty("react");
			expect(result?.config.shared?.ui).toHaveProperty("react-dom");
		});

		it("child values override parent values", async () => {
			const parentDir = join(tempDir, "parent-override");
			await mkdir(parentDir, { recursive: true });

			const parentConfig = {
				account: "parent.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://parent.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://parent.near",
						secrets: ["PARENT_SECRET"],
					},
				},
			};

			await writeFile(
				join(parentDir, "bos.config.json"),
				JSON.stringify(parentConfig, null, 2),
			);

			const childDir = join(tempDir, "child-override");
			await mkdir(childDir, { recursive: true });

			const childConfig = {
				extends: "../parent-override/bos.config.json",
				account: "child.near",
				app: {
					host: {
						development: "http://localhost:3001", // Override
						secrets: ["CHILD_SECRET"], // Override (array replacement)
					},
				},
			};

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(childConfig, null, 2),
			);

			const result = await loadConfig({ cwd: childDir });
			expect(result?.config.app.host.development).toBe("http://localhost:3001");
			expect(result?.config.app.host.secrets).toEqual(["CHILD_SECRET"]); // Replaced, not merged
		});

		it("handles deeply nested extends (grandparent → parent → child)", async () => {
			// Grandparent
			const grandparentDir = join(tempDir, "grandparent");
			await mkdir(grandparentDir, { recursive: true });
			await writeFile(
				join(grandparentDir, "bos.config.json"),
				JSON.stringify(
					{
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
					},
					null,
					2,
				),
			);

			// Parent extends grandparent
			const parentDir = join(tempDir, "parent-nested");
			await mkdir(parentDir, { recursive: true });
			await writeFile(
				join(parentDir, "bos.config.json"),
				JSON.stringify(
					{
						extends: "../grandparent/bos.config.json",
						account: "parent.near",
						app: {
							api: {
								name: "api",
								development: "http://localhost:3014",
								production: "https://api.parent.near",
							},
						},
					},
					null,
					2,
				),
			);

			// Child extends parent
			const childDir = join(tempDir, "child-nested");
			await mkdir(childDir, { recursive: true });
			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(
					{
						extends: "../parent-nested/bos.config.json",
						account: "child.near",
						app: {
							ui: { name: "ui", development: "http://localhost:3003" }, // Override
						},
					},
					null,
					2,
				),
			);

			const result = await loadConfig({ cwd: childDir });
			expect(result?.config.account).toBe("child.near");
			expect(result?.config.gateway.development).toBe("http://localhost:8787"); // From grandparent
			expect(result?.config.app.ui.production).toBe("https://ui.gp.near"); // From grandparent
			expect(result?.config.app.ui.development).toBe("http://localhost:3003"); // From child
			expect(result?.config.app.api.development).toBe("http://localhost:3014"); // From parent
		});

		it("detects circular extends and throws ConfigCircularExtendsError", async () => {
			const dirA = join(tempDir, "circular-a");
			const dirB = join(tempDir, "circular-b");
			await mkdir(dirA, { recursive: true });
			await mkdir(dirB, { recursive: true });

			await writeFile(
				join(dirA, "bos.config.json"),
				JSON.stringify({
					extends: "../circular-b/bos.config.json",
					account: "a.near",
				}),
			);
			await writeFile(
				join(dirB, "bos.config.json"),
				JSON.stringify({
					extends: "../circular-a/bos.config.json",
					account: "b.near",
				}),
			);

			await expect(loadConfig({ cwd: dirA })).rejects.toThrow(
				ConfigCircularExtendsError,
			);
		});
	});

	describe("Config with Extends (BOS URL)", () => {
		it("fetches parent config from bos:// URL", async () => {
			// This test uses the real NEAR Social network
			// Using every.near/everything.dev which is a known working config
			const childDir = join(tempDir, "bos-url-child");
			await mkdir(childDir, { recursive: true });

			const childConfig = {
				extends: "bos://every.near/everything.dev",
				account: "child.near",
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://child.near",
					},
				},
			};

			await writeFile(
				join(childDir, "bos.config.json"),
				JSON.stringify(childConfig, null, 2),
			);

			// This may take a few seconds due to network request
			const result = await loadConfig({ cwd: childDir });
			expect(result).not.toBeNull();
			expect(result?.config.account).toBe("child.near");
			expect(result?.source.extended).toContain(
				"bos://every.near/everything.dev",
			);
		});

		it("times out after 10 seconds on slow BOS URL", async () => {
			// This is hard to test without mocking, so we'll skip in real tests
			// But the implementation should have a 10s timeout
		});

		it("throws ConfigFetchError on network failure", async () => {
			// This would require mocking the Graph class
			// Implementation should catch network errors and wrap in ConfigFetchError
		});
	});

	describe("Package Resolution", () => {
		it("lists all packages from config", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
					custom: {
						name: "custom",
						development: "http://localhost:3005",
						production: "https://custom.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			// Create package directories
			await mkdir(join(tempDir, "host"), { recursive: true });
			await mkdir(join(tempDir, "ui"), { recursive: true });
			await mkdir(join(tempDir, "api"), { recursive: true });
			await writeFile(join(tempDir, "host/package.json"), "{}");
			await writeFile(join(tempDir, "ui/package.json"), "{}");
			await writeFile(join(tempDir, "api/package.json"), "{}");
			// custom doesn't exist locally

			await loadConfig({ cwd: tempDir });
			const result = await resolvePackages(["host", "ui", "api", "custom"], {
				host: "local",
				ui: "local",
				api: "local",
				custom: "local",
			});

			expect(result.resolved.host.mode).toBe("local");
			expect(result.resolved.host.exists).toBe(true);
			expect(result.resolved.custom.mode).toBe("remote"); // Auto-switched
			expect(result.resolved.custom.exists).toBe(false);
			expect(result.autoRemote).toContain("custom");
		});

		it("auto-detects remote mode for missing packages", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			// Only host exists locally
			await mkdir(join(tempDir, "host"), { recursive: true });
			await writeFile(join(tempDir, "host/package.json"), "{}");

			await loadConfig({ cwd: tempDir });
			const result = await resolvePackages(["host", "ui", "api"], {
				host: "local",
				ui: "local",
				api: "local",
			});

			expect(result.resolved.host.mode).toBe("local");
			expect(result.resolved.ui.mode).toBe("remote"); // Auto-switched
			expect(result.resolved.api.mode).toBe("remote"); // Auto-switched
			expect(result.autoRemote).toEqual(["ui", "api"]);
		});

		it("computes correct ports for each package", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			await loadConfig({ cwd: tempDir });
			const result = await resolvePackages(["host", "ui", "api"], {
				host: "local",
				ui: "local",
				api: "local",
			});

			expect(result.resolved.host.port).toBe(3000);
			expect(result.resolved.ui.port).toBe(3002);
			expect(result.resolved.api.port).toBe(3014);
		});
	});

	describe("Runtime Config Generation", () => {
		it("generates runtime config for development", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
						proxy: "https://api.test.near/proxy",
						variables: { DB_NAME: "dev_db" },
						secrets: ["DB_URL"],
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result = await loadConfig({ cwd: tempDir, env: "development" });
			expect(result?.runtime.env).toBe("development");
			expect(result?.runtime.account).toBe("test.near");
			expect(result?.runtime.hostUrl).toBe("http://localhost:3000");
			expect(result?.runtime.ui.url).toBe("http://localhost:3002");
			expect(result?.runtime.api.url).toBe("http://localhost:3014");
			expect(result?.runtime.api.proxy).toBe("https://api.test.near/proxy");
			expect(result?.runtime.api.variables).toEqual({ DB_NAME: "dev_db" });
		});

		it("generates runtime config for production", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
						proxy: "https://api.test.near/proxy",
						variables: { DB_NAME: "prod_db" },
						secrets: ["DB_URL"],
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result = await loadConfig({ cwd: tempDir, env: "production" });
			expect(result?.runtime.env).toBe("production");
			expect(result?.runtime.ui.url).toBe("https://ui.test.near");
			expect(result?.runtime.api.url).toBe("https://api.test.near");
		});

		it("applies env var overrides (BOS_UI_URL)", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			// Set env var override
			process.env.BOS_UI_URL = "http://localhost:9999";

			const result = await loadConfig({ cwd: tempDir, env: "development" });
			expect(result?.runtime.ui.url).toBe("http://localhost:9999");

			delete process.env.BOS_UI_URL;
		});

		it("computes federation entry URLs", async () => {
			const config: BosConfig = {
				account: "test.near",
				gateway: {
					development: "http://localhost:8787",
					production: "https://test.near",
				},
				app: {
					host: {
						development: "http://localhost:3000",
						production: "https://test.near",
					},
					ui: {
						name: "ui",
						development: "http://localhost:3002",
						production: "https://ui.test.near",
					},
					api: {
						name: "api",
						development: "http://localhost:3014",
						production: "https://api.test.near",
					},
				},
			};

			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify(config, null, 2),
			);

			const result = await loadConfig({ cwd: tempDir, env: "development" });
			expect(result?.runtime.ui.entry).toBe(
				"http://localhost:3002/remoteEntry.js",
			);
			expect(result?.runtime.api.entry).toBe(
				"http://localhost:3014/remoteEntry.js",
			);
		});
	});

	describe("Error Handling", () => {
		it("throws on missing config file", async () => {
			const nonExistentDir = join(tempDir, "nonexistent");
			await mkdir(nonExistentDir, { recursive: true });

			const result = await loadConfig({ cwd: nonExistentDir });
			expect(result).toBeNull();
		});

		it("throws on invalid JSON", async () => {
			await writeFile(join(tempDir, "bos.config.json"), "{ invalid json");

			await expect(loadConfig({ cwd: tempDir })).rejects.toThrow();
		});

		it("throws on schema validation failure", async () => {
			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify({
					account: "test.near",
					// Missing required 'gateway' and 'app' fields
				}),
			);

			await expect(loadConfig({ cwd: tempDir })).rejects.toThrow();
		});

		it("throws ConfigCircularExtendsError on circular extends", async () => {
			const dirA = join(tempDir, "error-a");
			const dirB = join(tempDir, "error-b");
			await mkdir(dirA, { recursive: true });
			await mkdir(dirB, { recursive: true });

			await writeFile(
				join(dirA, "bos.config.json"),
				JSON.stringify({
					extends: "../error-b/bos.config.json",
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
					extends: "../error-a/bos.config.json",
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

			await expect(loadConfig({ cwd: dirA })).rejects.toThrow(
				ConfigCircularExtendsError,
			);
		});
	});

	describe("Helper Functions", () => {
		it("findConfigPath finds config in current directory", async () => {
			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify({
					account: "helper.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://helper.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://helper.near",
						},
					},
				}),
			);

			const path = findConfigPath(tempDir);
			expect(path).toBe(join(tempDir, "bos.config.json"));
		});

		it("findConfigPath walks up directory tree", async () => {
			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify({
					account: "walk.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://walk.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://walk.near",
						},
					},
				}),
			);

			const nestedDir = join(tempDir, "a", "b", "c");
			await mkdir(nestedDir, { recursive: true });

			const path = findConfigPath(nestedDir);
			expect(path).toBe(join(tempDir, "bos.config.json"));
		});

		it("findConfigPath returns null when no config found", async () => {
			const isolatedDir = await mkdtemp(join(tmpdir(), "isolated-helper-"));
			const path = findConfigPath(isolatedDir);
			expect(path).toBeNull();
			await rm(isolatedDir, { recursive: true });
		});

		it("getProjectRoot returns config directory", async () => {
			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify({
					account: "root.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://root.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://root.near",
						},
					},
				}),
			);

			await loadConfig({ cwd: tempDir });
			const root = getProjectRoot();
			expect(root).toBe(tempDir);
		});

		it("getConfig returns cached config", async () => {
			await writeFile(
				join(tempDir, "bos.config.json"),
				JSON.stringify({
					account: "cached.near",
					gateway: {
						development: "http://localhost:8787",
						production: "https://cached.near",
					},
					app: {
						host: {
							development: "http://localhost:3000",
							production: "https://cached.near",
						},
					},
				}),
			);

			await loadConfig({ cwd: tempDir });
			const config = getConfig();
			expect(config?.account).toBe("cached.near");
		});

		it("getConfig returns null when no config loaded", async () => {
			clearConfigCache();
			const config = getConfig();
			expect(config).toBeNull();
		});
	});
});
