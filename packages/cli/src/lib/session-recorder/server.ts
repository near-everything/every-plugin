import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  createSnapshotWithPlatform,
  runSilent,
} from "../resource-monitor";
import { ServerNotReady, ServerStartFailed } from "./errors";
import type { ServerHandle, ServerOrchestrator } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "../../..");

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface SpawnOptions {
  port?: number;
  account?: string;
  domain?: string;
  interactive?: boolean;
}

const createServerHandle = (
  proc: ReturnType<typeof spawn>,
  name: string,
  port: number
): ServerHandle => {
  proc.stdout?.on("data", () => {});
  proc.stderr?.on("data", () => {});

  let exitHandled = false;
  let exitCode: number | null = null;
  const exitPromise = new Promise<number | null>((resolve) => {
    (proc as unknown as NodeJS.EventEmitter).on("exit", (code: number | null) => {
      exitHandled = true;
      exitCode = code;
      resolve(code);
    });
  });

  return {
    pid: proc.pid!,
    port,
    name,
    kill: async () => {
      proc.kill("SIGTERM");
      const killPromise = new Promise<void>((res) => {
        const timeout = setTimeout(() => {
          proc.kill("SIGKILL");
          res();
        }, 5000);
        if (exitHandled) {
          clearTimeout(timeout);
          res();
        } else {
          exitPromise.then(() => {
            clearTimeout(timeout);
            res();
          });
        }
      });
      await killPromise;
    },
    waitForExit: (timeoutMs = 10000): Promise<number | null> =>
      new Promise((res) => {
        const timeout = setTimeout(() => res(null), timeoutMs);
        if (exitHandled) {
          clearTimeout(timeout);
          res(exitCode);
        } else {
          exitPromise.then((code) => {
            clearTimeout(timeout);
            res(code);
          });
        }
      }),
  };
};

const spawnBosStart = (options: SpawnOptions = {}): ServerHandle => {
  const args = [
    "run",
    "src/cli.ts",
    "start",
    "--account", options.account || "every.near",
    "--domain", options.domain || "everything.dev",
  ];

  if (!options.interactive) {
    args.push("--no-interactive");
  }

  if (options.port) {
    args.push("--port", String(options.port));
  }

  const proc = spawn("bun", args, {
    cwd: CLI_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env, NODE_ENV: "production" },
  });

  return createServerHandle(proc, "bos-start", options.port || 3000);
};

const spawnBosDev = (options: SpawnOptions = {}): ServerHandle => {
  const args = ["run", "src/cli.ts", "dev"];

  if (!options.interactive) {
    args.push("--no-interactive");
  }

  if (options.port) {
    args.push("--port", String(options.port));
  }

  const proc = spawn("bun", args, {
    cwd: CLI_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env, NODE_ENV: "development" },
  });

  return createServerHandle(proc, "bos-dev", options.port || 3000);
};

const waitForPortBound = async (
  port: number,
  timeoutMs = 60000
): Promise<boolean> => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const snapshot = await runSilent(
        createSnapshotWithPlatform({ ports: [port] })
      );
      if (snapshot.ports[port]?.state === "LISTEN") {
        return true;
      }
    } catch {
      // ignore errors during polling
    }
    await sleep(500);
  }

  return false;
};

const waitForPortFree = async (
  port: number,
  timeoutMs = 15000
): Promise<boolean> => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const snapshot = await runSilent(
        createSnapshotWithPlatform({ ports: [port] })
      );
      if (snapshot.ports[port]?.state === "FREE") {
        return true;
      }
    } catch {
      // ignore errors during polling
    }
    await sleep(200);
  }

  return false;
};

export const startServers = (
  mode: "start" | "dev" = "start",
  options: SpawnOptions = {}
): Effect.Effect<ServerOrchestrator, ServerStartFailed | ServerNotReady> =>
  Effect.gen(function* () {
    const port = options.port || 3000;

    yield* Effect.logInfo(`Starting BOS in ${mode} mode on port ${port}`);

    const handle = mode === "dev"
      ? spawnBosDev(options)
      : spawnBosStart(options);

    const ready = yield* Effect.tryPromise({
      try: () => waitForPortBound(port, 90000),
      catch: (e) => new ServerStartFailed({
        server: handle.name,
        port,
        reason: String(e),
      }),
    });

    if (!ready) {
      yield* Effect.promise(() => handle.kill());
      return yield* Effect.fail(
        new ServerNotReady({
          servers: [handle.name],
          timeoutMs: 90000,
        })
      );
    }

    yield* Effect.logInfo(`Server ready on port ${port}`);

    const orchestrator: ServerOrchestrator = {
      handles: [handle],
      ports: [port],
      shutdown: async () => {
        console.log("Shutting down servers");
        await handle.kill();
        await waitForPortFree(port, 15000);
        console.log("Servers stopped");
      },
      waitForReady: async () => {
        return waitForPortBound(port, 30000);
      },
    };

    return orchestrator;
  });

export const shutdownServers = (
  orchestrator: ServerOrchestrator
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Shutting down ${orchestrator.handles.length} server(s)`);

    for (const handle of orchestrator.handles) {
      yield* Effect.logDebug(`Killing ${handle.name} (PID ${handle.pid})`);
      yield* Effect.promise(() => handle.kill());
    }

    for (const port of orchestrator.ports) {
      yield* Effect.logDebug(`Waiting for port ${port} to be free`);
      const freed = yield* Effect.promise(() => waitForPortFree(port, 15000));
      if (!freed) {
        yield* Effect.logWarning(`Port ${port} still bound after shutdown`);
      }
    }

    yield* Effect.logInfo("All servers stopped");
  });

export const checkPortsAvailable = (
  ports: number[]
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const snapshot = yield* Effect.promise(() =>
      runSilent(createSnapshotWithPlatform({ ports }))
    );

    for (const port of ports) {
      if (snapshot.ports[port]?.state !== "FREE") {
        yield* Effect.logWarning(`Port ${port} is already in use`);
        return false;
      }
    }

    return true;
  });

export { waitForPortBound, waitForPortFree };
