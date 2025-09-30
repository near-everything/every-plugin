import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sirv from "sirv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../test-plugin/dist");
const TEST_PORT = 3999;

let server: ReturnType<typeof createServer> | null = null;

export async function setup() {
  console.log("Starting test plugin server for integration tests...");

  const serve = sirv(FIXTURES_DIR, {
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

    server.listen(TEST_PORT, () => {
      console.log(`Test plugin server started on port ${TEST_PORT}`);
      resolve();
    });

    server.on("error", (error) => {
      console.error("Test server error:", error);
      reject(error);
    });
  });
}

export async function teardown() {
  if (server) {
    return new Promise<void>((resolve) => {
      server?.close(() => {
        console.log(`Test plugin server stopped on port ${TEST_PORT}`);
        server = null;
        resolve();
      });
    });
  }
}

// Port pool for integration tests to avoid conflicts
export const PORT_POOL = {
  TEST_PLUGIN_SERVER: 3999,
  OPENAPI_TEST: 4001,
  RPC_TEST: 4002, 
  STREAMING_TEST: 4003,
  OPENAPI_GEN_TEST: 4004
} as const;

// Export test server URL for use in tests
export const TEST_SERVER_URL = `http://localhost:${TEST_PORT}`;
export const TEST_REMOTE_ENTRY_URL = `${TEST_SERVER_URL}/remoteEntry.js`;
