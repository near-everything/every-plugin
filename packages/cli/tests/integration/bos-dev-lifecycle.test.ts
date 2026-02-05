import { type ChildProcess, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertAllPortsFreeWithPlatform,
  createSnapshotWithPlatform,
  diffSnapshots,
  formatDiff,
  hasLeaks,
  runSilent,
} from "../../src/lib/resource-monitor";
import {
  SessionRecorder,
  formatReportSummary,
} from "../../src/lib/session-recorder";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "../..");

const IS_WINDOWS = process.platform === "win32";
const DEV_PORT = 3000;
const STARTUP_TIMEOUT = 60000;
const CLEANUP_TIMEOUT = 10000;
const BASE_URL = "http://localhost:3000";

interface DevProcess {
  process: ChildProcess;
  pid: number;
  stdout: string;
  stderr: string;
  kill: (signal?: NodeJS.Signals) => void;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

const spawnBosDev = (): DevProcess => {
  const proc = spawn(
    "bun",
    ["run", "src/cli.ts", "dev", "--no-interactive"],
    {
      cwd: CLI_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      env: { ...process.env, NODE_ENV: "development" },
    }
  );

  let stdout = "";
  let stderr = "";

  proc.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  proc.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  return {
    process: proc,
    pid: proc.pid!,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      proc.kill(signal);
    },
    waitForExit: (timeoutMs = 10000): Promise<number | null> =>
      new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), timeoutMs);
        proc.on("exit", (code: number | null) => {
          clearTimeout(timeout);
          resolve(code);
        });
      }),
  };
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForPortBound = async (
  port: number,
  timeoutMs = 30000
): Promise<boolean> => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const snapshot = await runSilent(createSnapshotWithPlatform({ ports: [port] }));
      if (snapshot.ports[port]?.state === "LISTEN") {
        return true;
      }
    } catch {
    }
    await sleep(500);
  }

  return false;
};

const waitForPortFree = async (
  port: number,
  timeoutMs = 10000
): Promise<boolean> => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const snapshot = await runSilent(createSnapshotWithPlatform({ ports: [port] }));
      if (snapshot.ports[port]?.state === "FREE") {
        return true;
      }
    } catch {
    }
    await sleep(200);
  }

  return false;
};

const cleanupProcess = async (proc: DevProcess | null): Promise<void> => {
  if (!proc) return;

  if (IS_WINDOWS) {
    proc.kill();
  } else {
    proc.kill("SIGKILL");
  }
  await proc.waitForExit(5000);
};

describe("BOS Dev Lifecycle Integration Tests", () => {
  let devProcess: DevProcess | null = null;

  afterEach(async () => {
    if (devProcess) {
      await cleanupProcess(devProcess);
      devProcess = null;
    }
    await sleep(1000);
  });

  it(
    "should start in dev mode, bind port, and cleanup cleanly",
    async () => {
      const baseline = await runSilent(
        createSnapshotWithPlatform({ ports: [DEV_PORT] })
      );
      expect(baseline.ports[DEV_PORT].state).toBe("FREE");

      const recorder = await Effect.runPromise(
        SessionRecorder.create({
          ports: [DEV_PORT],
          baseUrl: BASE_URL,
          headless: true,
        })
      );

      await Effect.runPromise(recorder.startRecording());

      const startTime = Date.now();
      devProcess = spawnBosDev();

      const ready = await waitForPortBound(DEV_PORT, STARTUP_TIMEOUT);

      if (!ready) {
        console.error("Dev server failed to start. Captured output:");
        console.error("STDOUT:", devProcess.stdout);
        console.error("STDERR:", devProcess.stderr);
      }
      expect(ready).toBe(true);

      const portBindTimeMs = Date.now() - startTime;

      await Effect.runPromise(
        recorder.recordEvent("custom", "dev_server_ready", { portBindTimeMs })
      );

      const running = await runSilent(
        createSnapshotWithPlatform({ ports: [DEV_PORT] })
      );
      expect(running.ports[DEV_PORT].state).toBe("LISTEN");

      console.log(`\nDev server started in ${portBindTimeMs}ms`);
      console.log(`Process count: ${running.processes.length}`);
      console.log(`Memory RSS: ${(running.memory.processRss / 1024 / 1024).toFixed(1)}MB\n`);

      if (IS_WINDOWS) {
        devProcess.kill();
      } else {
        devProcess.kill("SIGTERM");
      }

      await Effect.runPromise(
        recorder.recordEvent("custom", "shutdown_initiated")
      );

      const freed = await waitForPortFree(DEV_PORT, CLEANUP_TIMEOUT);

      if (!freed) {
        console.error("Port not freed after SIGTERM. Forcing SIGKILL...");
        devProcess.kill("SIGKILL");
        await waitForPortFree(DEV_PORT, 5000);
      }

      const after = await runSilent(
        createSnapshotWithPlatform({ ports: [DEV_PORT] })
      );

      const diff = diffSnapshots(running, after);
      const leaks = hasLeaks(diff);

      const sessionReport = await Effect.runPromise(recorder.stopRecording());

      console.log(formatReportSummary(sessionReport));

      if (leaks) {
        console.error("Resource leaks detected:");
        console.error(formatDiff(diff));
      }

      await writeFile(
        resolve(CLI_DIR, "dev-session-report.json"),
        JSON.stringify(sessionReport, null, 2)
      );

      expect(after.ports[DEV_PORT].state).toBe("FREE");
      expect(diff.stillBoundPorts).toHaveLength(0);
      expect(leaks).toBe(false);

      await runSilent(assertAllPortsFreeWithPlatform([DEV_PORT]));

      devProcess = null;
    },
    STARTUP_TIMEOUT + CLEANUP_TIMEOUT + 5000
  );
});
