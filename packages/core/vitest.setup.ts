import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

let pluginServer: ChildProcess | null = null;

export async function setup() {
	console.log("Starting template plugin server...");

	// Start the plugin dev server
	pluginServer = spawn("bun", ["run", "dev"], {
		cwd: "../../templates/plugin",
		stdio: ["ignore", "pipe", "pipe"],
		detached: false,
	});

	if (pluginServer.stdout) {
		pluginServer.stdout.on("data", (data) => {
			const output = data.toString();
			if (output.includes("Local:") || output.includes("localhost:3000")) {
				console.log("Plugin server started:", output.trim());
			}
		});
	}

	if (pluginServer.stderr) {
		pluginServer.stderr.on("data", (data) => {
			console.error("Plugin server error:", data.toString());
		});
	}

	// Wait for server to start
	console.log("Waiting for plugin server to be ready...");
	await setTimeout(5000); // Give the server time to start

	// Test if server is responding
	try {
		const response = await fetch("http://localhost:3000/remoteEntry.js", {
			method: "HEAD",
		});
		if (response.ok) {
			console.log("Plugin server is ready!");
		} else {
			console.warn("Plugin server may not be fully ready yet");
		}
	} catch (error) {
		console.warn("Could not verify plugin server readiness:", error);
	}
}

export async function teardown() {
	console.log("Shutting down template plugin server...");

	if (pluginServer) {
		pluginServer.kill("SIGTERM");

		// Wait a bit for graceful shutdown
		await setTimeout(2000);

		// Force kill if still running
		if (!pluginServer.killed) {
			pluginServer.kill("SIGKILL");
		}

		pluginServer = null;
		console.log("Plugin server stopped");
	}
}
