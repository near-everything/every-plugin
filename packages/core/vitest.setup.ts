import { createServer, type Server } from "http";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { setTimeout } from "timers/promises";

let pluginServer: Server | null = null;
let sourcePluginServer: Server | null = null;

async function startStaticServer(name: string, port: number, staticPath: string): Promise<Server> {
	console.log(`Starting ${name} static server on port ${port}...`);
	
	const server = createServer(async (req, res) => {
		// Set CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		
		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}
		
		const url = new URL(req.url || "/", `http://localhost:${port}`);
		const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
		const fullPath = join(process.cwd(), staticPath, filePath);
		
		try {
			// Check if file exists
			await stat(fullPath);
			
			// Read and serve the file
			const content = await readFile(fullPath);
			
			// Set content type based on file extension
			const ext = filePath.split('.').pop()?.toLowerCase();
			const contentType = ext === 'js' ? 'application/javascript' : 
							   ext === 'css' ? 'text/css' :
							   ext === 'html' ? 'text/html' :
							   'application/octet-stream';
			
			res.setHeader("Content-Type", contentType);
			res.writeHead(200);
			res.end(content);
		} catch (error) {
			// File not found
			res.writeHead(404);
			res.end("Not Found");
		}
	});
	
	return new Promise((resolve, reject) => {
		server.listen(port, (err?: Error) => {
			if (err) {
				reject(err);
			} else {
				console.log(`${name} server started at http://localhost:${port}`);
				resolve(server);
			}
		});
	});
}

async function waitForServerReady(url: string, serverName: string): Promise<void> {
	const maxRetries = 10;
	const retryDelay = 500;
	
	for (let i = 0; i < maxRetries; i++) {
		try {
			const response = await fetch(url, { method: "HEAD" });
			if (response.ok) {
				console.log(`${serverName} is ready!`);
				return;
			}
		} catch (error) {
			// Server not ready yet, continue retrying
		}
		
		if (i < maxRetries - 1) {
			await setTimeout(retryDelay);
		}
	}
	
	console.warn(`Could not verify ${serverName} readiness after ${maxRetries} attempts`);
}

export async function setup() {
	try {
		console.log("Starting static file servers for existing dist files...");
		
		// Start static file servers using existing dist files
		pluginServer = await startStaticServer(
			"Plugin",
			3000,
			"../../templates/plugin/dist/"
		);
		
		sourcePluginServer = await startStaticServer(
			"Source Plugin", 
			3001,
			"../../templates/source-plugin/dist/"
		);

		// Wait for servers to be ready
		await Promise.all([
			waitForServerReady("http://localhost:3000/remoteEntry.js", "Plugin server"),
			waitForServerReady("http://localhost:3001/remoteEntry.js", "Source plugin server"),
		]);
		
	} catch (error) {
		console.error("Error during setup:", error);
		await teardown();
		throw error;
	}
}

export async function teardown() {
	console.log("Shutting down static file servers...");
	
	try {
		if (pluginServer) {
			pluginServer.close();
			console.log("Plugin server stopped");
		}
		
		if (sourcePluginServer) {
			sourcePluginServer.close();
			console.log("Source plugin server stopped");
		}
	} catch (error) {
		console.error("Error during teardown:", error);
	} finally {
		pluginServer = null;
		sourcePluginServer = null;
	}
}
