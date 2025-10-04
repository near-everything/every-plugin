import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import sirv from "sirv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TELEGRAM_PLUGIN_DIST_DIR = join(__dirname, "../../../dist");
const TELEGRAM_PLUGIN_ROOT = join(__dirname, "../../..");
const TELEGRAM_TEST_PORT = 3015; // Use different port from test-plugin (3999) and rspack dev (3014)

let server: ReturnType<typeof createServer> | null = null;

export async function setup() {
  console.log("Building telegram plugin before integration tests...");
  
  try {
    // Build the plugin first to ensure we have the latest code
    execSync("bun run build", {
      cwd: TELEGRAM_PLUGIN_ROOT,
      stdio: "inherit",
      timeout: 30000, // 30 second timeout
    });
    console.log("✅ Plugin build completed");
  } catch (error) {
    console.error("❌ Plugin build failed:", error);
    throw new Error("Failed to build telegram plugin for integration tests");
  }

  console.log("Starting telegram plugin server for Module Federation integration tests...");

  const serve = sirv(TELEGRAM_PLUGIN_DIST_DIR, {
    dev: true,
    single: false,
  });

  return new Promise<void>((resolve, reject) => {
    server = createServer((req, res) => {
      // Add additional CORS headers for Module Federation
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      serve(req, res);
    });

    server.listen(TELEGRAM_TEST_PORT, () => {
      console.log(`Telegram plugin server started on port ${TELEGRAM_TEST_PORT}`);
      console.log(`Serving from: ${TELEGRAM_PLUGIN_DIST_DIR}`);
      resolve();
    });

    server.on("error", (error) => {
      console.error("Telegram plugin test server error:", error);
      reject(error);
    });
  });
}

export async function teardown() {
  if (server) {
    return new Promise<void>((resolve) => {
      server?.close(() => {
        console.log(`Telegram plugin test server stopped on port ${TELEGRAM_TEST_PORT}`);
        server = null;
        resolve();
      });
    });
  }
}

// Port pool for telegram plugin integration tests
export const TELEGRAM_PORT_POOL = {
  PLUGIN_TEST_SERVER: 3015,
  WEBHOOK_TEST: 3016,
  POLLING_TEST: 3017,
} as const;

// Export test server URL for use in tests
export const TELEGRAM_TEST_SERVER_URL = `http://localhost:${TELEGRAM_TEST_PORT}`;
export const TELEGRAM_REMOTE_ENTRY_URL = `${TELEGRAM_TEST_SERVER_URL}/remoteEntry.js`;
