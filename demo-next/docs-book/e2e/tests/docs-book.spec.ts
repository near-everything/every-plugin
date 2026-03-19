import { expect, test } from "@playwright/test";

const hostUrl = process.env.E2E_HOST_URL ?? "http://localhost:3000";
const testMode = process.env.E2E_TEST_MODE ?? "local";

test.describe(`Docs Book E2E (${testMode} mode)`, () => {
	test("page loads and shows docs list", async ({ page }) => {
		await page.goto(hostUrl);

		await expect(page).toHaveTitle(/Docs Book/);

		await expect(page.locator("text=Introduction")).toBeVisible();
		await expect(page.locator("text=Getting Started")).toBeVisible();
		await expect(page.locator("text=Architecture")).toBeVisible();
	});

	test("click doc -> /docs/<slug> shows content", async ({ page }) => {
		await page.goto(hostUrl);

		await page.click("text=Introduction");

		await expect(page).toHaveURL(/\/docs\/intro/);

		await expect(page.locator("h1")).toContainText("Introduction");
		await expect(page.locator("text=Welcome to the Docs Book")).toBeVisible();
	});

	test("navigate to getting-started doc", async ({ page }) => {
		await page.goto(`${hostUrl}/docs/getting-started`);

		await expect(page.locator("h1")).toContainText("Getting Started");
		await expect(page.locator("text=Installation")).toBeVisible();
		await expect(page.locator("text=everything-dev-next")).toBeVisible();
	});

	test("navigate to architecture doc", async ({ page }) => {
		await page.goto(`${hostUrl}/docs/architecture`);

		await expect(page.locator("h1")).toContainText("Architecture");
		await expect(page.locator("text=Module Federation")).toBeVisible();
	});

	test("SSR hydration didn't crash (no console errors)", async ({ page }) => {
		const errors: string[] = [];

		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		page.on("pageerror", (err) => {
			errors.push(err.message);
		});

		await page.goto(hostUrl);
		await page.waitForLoadState("networkidle");

		await page.click("text=Introduction");
		await page.waitForLoadState("networkidle");

		const criticalErrors = errors.filter(
			(e) =>
				!e.includes("favicon") &&
				!e.includes("manifest.json") &&
				!e.includes("ResizeObserver") &&
				!e.includes("networkidle"),
		);

		expect(criticalErrors).toHaveLength(0);
	});

	test("API health endpoint is accessible", async ({ request }) => {
		const res = await request.get(`${hostUrl}/api/_health`);
		expect(res.ok()).toBeTruthy();

		const body = await res.json();
		expect(body.status).toBeDefined();
	});

	test("host health endpoint is accessible", async ({ request }) => {
		const res = await request.get(`${hostUrl}/health`);
		expect(res.ok()).toBeTruthy();
	});
});
