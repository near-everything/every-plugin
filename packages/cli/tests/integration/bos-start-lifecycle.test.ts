import { type ChildProcess, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Metric } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertAllPortsFreeWithPlatform,
  assertNoLeaks,
  createSnapshotWithPlatform,
  diffSnapshots,
  formatDiff,
  hasLeaks,
  runSilent,
  type Snapshot
} from "../../src/lib/resource-monitor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "../..");

const IS_WINDOWS = process.platform === "win32";
const START_PORT = 3000;
const STARTUP_TIMEOUT = 90000;
const CLEANUP_TIMEOUT = 15000;

const memoryUsageGauge = Metric.gauge("bos_start_memory_mb");
const portBindTimeGauge = Metric.gauge("bos_start_port_bind_time_ms");
const cleanupTimeGauge = Metric.gauge("bos_start_cleanup_time_ms");
const processCountGauge = Metric.gauge("bos_start_process_count");

interface StartProcess {
  process: ChildProcess;
  pid: number;
  stdout: string;
  stderr: string;
  kill: (signal?: NodeJS.Signals) => void;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

const spawnBosStart = (): StartProcess => {
  const proc = spawn(
    "bun",
    ["run", "src/cli.ts", "start", "--account", "every.near", "--domain", "everything.dev", "--no-interactive"],
    {
      cwd: CLI_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      env: { ...process.env, NODE_ENV: "production" },
    }
  );

  let stdout = "";
  let stderr = "";

  proc.stdout?.on("data", (data) => {
    stdout += data.toString();
  });

  proc.stderr?.on("data", (data) => {
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
        proc.on("exit", (code) => {
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
      // ignore
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
      // ignore
    }
    await sleep(200);
  }

  return false;
};

const cleanupProcess = async (proc: StartProcess | null): Promise<void> => {
  if (!proc) return;

  if (IS_WINDOWS) {
    proc.kill();
  } else {
    proc.kill("SIGKILL");
  }
  await proc.waitForExit(5000);
};

interface LifecycleMetrics {
  portBindTimeMs: number;
  cleanupTimeMs: number;
  memoryUsageMb: number;
  processCount: number;
  baseline: Snapshot;
  running: Snapshot;
  after: Snapshot;
  hasLeaks: boolean;
}

const writeMetricsReport = async (
  metrics: LifecycleMetrics,
  filepath: string
): Promise<void> => {
  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    metrics: {
      portBindTimeMs: metrics.portBindTimeMs,
      cleanupTimeMs: metrics.cleanupTimeMs,
      memoryUsageMb: metrics.memoryUsageMb,
      processCount: metrics.processCount,
    },
    snapshots: {
      baseline: {
        timestamp: metrics.baseline.timestamp,
        portsMonitored: Object.keys(metrics.baseline.ports).length,
        processCount: metrics.baseline.processes.length,
      },
      running: {
        timestamp: metrics.running.timestamp,
        portsMonitored: Object.keys(metrics.running.ports).length,
        processCount: metrics.running.processes.length,
        memoryRssMb: metrics.running.memory.processRss / 1024 / 1024,
      },
      after: {
        timestamp: metrics.after.timestamp,
        portsMonitored: Object.keys(metrics.after.ports).length,
        processCount: metrics.after.processes.length,
      },
    },
    hasLeaks: metrics.hasLeaks,
  };

  await writeFile(filepath, JSON.stringify(report, null, 2));
};

describe("BOS Start Lifecycle Integration Tests", () => {
  let startProcess: StartProcess | null = null;

  afterEach(async () => {
    if (startProcess) {
      await cleanupProcess(startProcess);
      startProcess = null;
    }
    await sleep(1000);
  });

  it(
    "should start with remote modules, cleanup cleanly, and produce metrics",
    async () => {
      const baseline = await runSilent(
        createSnapshotWithPlatform({ ports: [START_PORT] })
      );
      expect(baseline.ports[START_PORT].state).toBe("FREE");

      const startTime = Date.now();
      startProcess = spawnBosStart();

      const ready = await waitForPortBound(START_PORT, STARTUP_TIMEOUT);

      if (!ready) {
        console.error("Server failed to start. Captured output:");
        console.error("STDOUT:", startProcess.stdout);
        console.error("STDERR:", startProcess.stderr);
      }
      expect(ready).toBe(true);

      const portBindTimeMs = Date.now() - startTime;

      const running = await runSilent(
        createSnapshotWithPlatform({ ports: [START_PORT] })
      );
      expect(running.ports[START_PORT].state).toBe("LISTEN");

      const memoryUsageMb = running.memory.processRss / 1024 / 1024;
      const processCount = running.processes.length;

      await Effect.runPromise(portBindTimeGauge(Effect.succeed(portBindTimeMs)));
      await Effect.runPromise(memoryUsageGauge(Effect.succeed(memoryUsageMb)));
      await Effect.runPromise(processCountGauge(Effect.succeed(processCount)));

      const killStart = Date.now();

      if (IS_WINDOWS) {
        startProcess.kill();
      } else {
        startProcess.kill("SIGTERM");
      }

      const freed = await waitForPortFree(START_PORT, CLEANUP_TIMEOUT);

      if (!freed) {
        console.error("Port not freed after SIGTERM. Forcing SIGKILL...");
        startProcess.kill("SIGKILL");
        await waitForPortFree(START_PORT, 5000);
      }

      const cleanupTimeMs = Date.now() - killStart;
      await Effect.runPromise(cleanupTimeGauge(Effect.succeed(cleanupTimeMs)));

      const after = await runSilent(
        createSnapshotWithPlatform({ ports: [START_PORT] })
      );

      const diff = diffSnapshots(running, after);
      const leaks = hasLeaks(diff);

      console.log("\n--- Lifecycle Metrics ---");
      console.log(`Port bind time: ${portBindTimeMs}ms`);
      console.log(`Cleanup time: ${cleanupTimeMs}ms`);
      console.log(`Memory usage: ${memoryUsageMb.toFixed(1)}MB`);
      console.log(`Process count: ${processCount}`);
      console.log(`Has leaks: ${leaks}`);
      console.log("-------------------------\n");

      if (leaks) {
        console.error("Resource leaks detected:");
        console.error(formatDiff(diff));
      }

      const metrics: LifecycleMetrics = {
        portBindTimeMs,
        cleanupTimeMs,
        memoryUsageMb,
        processCount,
        baseline,
        running,
        after,
        hasLeaks: leaks,
      };

      await writeMetricsReport(metrics, resolve(CLI_DIR, "test-metrics.json"));

      expect(after.ports[START_PORT].state).toBe("FREE");
      expect(diff.orphanedProcesses).toHaveLength(0);
      expect(diff.stillBoundPorts).toHaveLength(0);
      expect(leaks).toBe(false);

      await runSilent(assertNoLeaks(diff));
      await runSilent(assertAllPortsFreeWithPlatform([START_PORT]));

      startProcess = null;
    },
    STARTUP_TIMEOUT + CLEANUP_TIMEOUT + 5000
  );
});
