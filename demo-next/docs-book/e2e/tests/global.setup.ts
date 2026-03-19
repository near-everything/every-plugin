import { test as setup } from "@playwright/test";

setup("ensure servers are ready", async () => {
	console.log("[E2E] Checking server readiness...");

	const maxRetries = 30;
	const retryDelay = 2000;

	for (let i = 0; i < maxRetries; i++) {
		try {
			const response = await fetch("http://localhost:3000/ready");
			if (response.ok) {
				console.log("[E2E] Host server is ready");
				return;
			}
		} catch (error) {
			console.log(`[E2E] Attempt ${i + 1}/${maxRetries}: Server not ready yet`);
		}

		await new Promise((resolve) => setTimeout(resolve, retryDelay));
	}

	throw new Error("Server did not become ready in time");
});
