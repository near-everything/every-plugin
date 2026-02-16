import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";

const CLI_PATH = join(__dirname, "../../src/cli.ts");

describe("Create Project Integration", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "bos-create-project-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates project with all args (no prompts)", async () => {
		const projectName = "testproject";
		const projectDir = join(tempDir, projectName);

		// Run create command with all args
		const result = await execa(
			"bun",
			[
				"run",
				CLI_PATH,
				"create",
				"project",
				projectName,
				"--account",
				"testproject.near",
				"--testnet",
				"testproject.testnet",
				"--template",
				"bos://every.near/everything.dev",
			],
			{
				cwd: tempDir,
				timeout: 120000, // 2 minutes for git clone + network
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Created project");

		// Verify project structure
		const entries = await readdir(projectDir);
		expect(entries).toContain("api");
		expect(entries).toContain("ui");
		expect(entries).not.toContain("host"); // Not included by default
		expect(entries).not.toContain("gateway"); // Not included by default
		expect(entries).toContain("bos.config.json");
		expect(entries).toContain("package.json");
		expect(entries).toContain(".gitignore");
		expect(entries).toContain("bunfig.toml");
		expect(entries).toContain(".env.example");
		expect(entries).toContain(".agent");

		// Verify bos.config.json structure
		const bosConfig = JSON.parse(
			await readFile(join(projectDir, "bos.config.json"), "utf8"),
		);
		expect(bosConfig.extends).toBe("bos://every.near/everything.dev");
		expect(bosConfig.account).toBe("testproject.near");
		expect(bosConfig.testnet).toBe("testproject.testnet");
		expect(bosConfig.app).toBeDefined();
		expect(bosConfig.app.ui).toBeDefined();
		expect(bosConfig.app.api).toBeDefined();
		expect(bosConfig.app.host).toBeUndefined(); // Should NOT be present (inherited from extends)

		// Verify package.json workspaces only include api and ui
		const pkgJson = JSON.parse(
			await readFile(join(projectDir, "package.json"), "utf8"),
		);
		expect(pkgJson.workspaces.packages).toEqual(["api", "ui"]);

		// Verify .agent/skills/bos/ exists (fetched from template)
		const agentDir = join(projectDir, ".agent", "skills", "bos");
		const agentEntries = await readdir(agentDir);
		expect(agentEntries).toContain("SKILL.md");

		// Verify AGENTS.md exists (fetched from template)
		const agentsMd = await readFile(join(projectDir, "AGENTS.md"), "utf8");
		expect(agentsMd).toContain("<skills_system");
		expect(agentsMd).toContain("<available_skills>");
		expect(agentsMd).toContain("bos");

		// Verify .env.example has secrets
		const envExample = await readFile(join(projectDir, ".env.example"), "utf8");
		expect(envExample).toContain("HOST_DATABASE_URL=");
		expect(envExample).toContain("API_DATABASE_URL=");

		// Verify excluded files were removed
		const excludedFiles = ["database.db", ".bos", ".env", ".env.bos"];
		for (const file of excludedFiles) {
			await expect(stat(join(projectDir, file))).rejects.toThrow();
		}

		// Load the config and verify extends works
		const loadedConfig = await loadConfig({ cwd: projectDir });
		expect(loadedConfig).not.toBeNull();
		expect(loadedConfig?.config.account).toBe("testproject.near");
		// Should inherit app.host from everything.dev
		expect(loadedConfig?.config.app.host).toBeDefined();
		expect(loadedConfig?.config.gateway).toBeDefined();
	}, 120000); // 2 minute timeout for git clone + network

	it("creates project with host and gateway when flags provided", async () => {
		const projectName = "fullproject";
		const projectDir = join(tempDir, projectName);

		const result = await execa(
			"bun",
			[
				"run",
				CLI_PATH,
				"create",
				"project",
				projectName,
				"--account",
				"fullproject.near",
				"--include-host",
				"--include-gateway",
			],
			{
				cwd: tempDir,
				timeout: 120000,
			},
		);

		expect(result.exitCode).toBe(0);

		// Verify host and gateway are included
		const entries = await readdir(projectDir);
		expect(entries).toContain("host");
		expect(entries).toContain("gateway");

		// Verify package.json has all workspaces
		const pkgJson = JSON.parse(
			await readFile(join(projectDir, "package.json"), "utf8"),
		);
		expect(pkgJson.workspaces.packages).toEqual(
			expect.arrayContaining(["api", "ui", "host", "gateway"]),
		);
	}, 120000);

	it("does not include testnet when not provided", async () => {
		const projectName = "mainnetonly";
		const projectDir = join(tempDir, projectName);

		await execa(
			"bun",
			[
				"run",
				CLI_PATH,
				"create",
				"project",
				projectName,
				"--account",
				"mainnetonly.near",
			],
			{
				cwd: tempDir,
				timeout: 120000,
			},
		);

		const bosConfig = JSON.parse(
			await readFile(join(projectDir, "bos.config.json"), "utf8"),
		);
		expect(bosConfig.account).toBe("mainnetonly.near");
		expect(bosConfig.testnet).toBeUndefined(); // Should NOT be present
	}, 120000);

	it("can run bos sync after creation", async () => {
		const projectName = "everytest";
		const projectDir = join(tempDir, projectName);

		// Create project
		await execa(
			"bun",
			[
				"run",
				CLI_PATH,
				"create",
				"project",
				projectName,
				"--account",
				"every.near",
			],
			{
				cwd: tempDir,
				timeout: 120000,
			},
		);

		// Run sync (using update command which syncs files)
		const syncResult = await execa("bun", ["run", CLI_PATH, "update"], {
			cwd: projectDir,
			timeout: 60000,
		});

		expect(syncResult.exitCode).toBe(0);
		// Sync should populate any missing pieces from template
	}, 120000);
});
