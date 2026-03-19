import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	workers: 1,
	reporter: [
		["list"],
		...(isCI ? [["github"] as const] : []),
		["html", { open: "never", outputFolder: "e2e/report" }],
	],
	use: {
		baseURL: "http://localhost:3000",
		trace: isCI ? "on-first-retry" : "retain-on-failure",
		screenshot: "only-on-failure",
		video: isCI ? "on-first-retry" : "off",
	},
	projects: [
		{
			name: "setup",
			testMatch: /global\.setup\.ts/,
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["setup"],
		},
	],
	webServer: {
		command: "cd .. && bun run dev",
		url: "http://localhost:3000/ready",
		reuseExistingServer: !isCI,
		timeout: 120000,
	},
});
