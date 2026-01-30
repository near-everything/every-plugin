import { Effect } from "effect";
import { spawn, type ChildProcess, type SpawnOptions } from "child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ResourceMonitor,
  type Snapshot,
  type SnapshotDiff,
  runSilent,
  createSnapshotWithPlatform,
  assertAllPortsFreeWithPlatform,
  assertNoOrphanProcesses,
  assertNoLeaks,
  diffSnapshots,
  hasLeaks,
} from "../../src/lib/resource-monitor";

export interface DevProcess {
  process: ChildProcess;
  pid: number;
  kill: (signal?: NodeJS.Signals) => void;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

export interface TestContext {
  monitor: ResourceMonitor;
  devProcess: DevProcess | null;
  baseline: Snapshot | null;
  running: Snapshot | null;
  after: Snapshot | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(__dirname, "../..");
const DEMO_DIR = resolve(CLI_DIR, "..");

export const DEV_PORTS = [3000, 3002, 3014];

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createTestContext = async (
  ports: number[] = DEV_PORTS
): Promise<TestContext> => {
  const monitor = await runSilent(
    ResourceMonitor.createWithPlatform({ ports })
  );
  return {
    monitor,
    devProcess: null,
    baseline: null,
    running: null,
    after: null,
  };
};

export const spawnDevServer = (cwd: string = DEMO_DIR): DevProcess => {
  const proc = spawn("bun", ["bos", "dev"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

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

export const waitForPortBound = async (
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

export const waitForPortFree = async (
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

export const captureBaseline = async (ctx: TestContext): Promise<Snapshot> => {
  ctx.baseline = await runSilent(ctx.monitor.snapshotWithPlatform());
  return ctx.baseline;
};

export const captureRunning = async (ctx: TestContext): Promise<Snapshot> => {
  ctx.running = await runSilent(ctx.monitor.snapshotWithPlatform());
  return ctx.running;
};

export const captureAfter = async (ctx: TestContext): Promise<Snapshot> => {
  ctx.after = await runSilent(ctx.monitor.snapshotWithPlatform());
  return ctx.after;
};

export const getDiff = (from: Snapshot, to: Snapshot): SnapshotDiff => {
  return diffSnapshots(from, to);
};

export const getBoundPorts = (snapshot: Snapshot): number[] => {
  return Object.entries(snapshot.ports)
    .filter(([, info]) => info.state === "LISTEN")
    .map(([port]) => parseInt(port, 10));
};

export const getFreePorts = (snapshot: Snapshot): number[] => {
  return Object.entries(snapshot.ports)
    .filter(([, info]) => info.state === "FREE")
    .map(([port]) => parseInt(port, 10));
};

export const forceKillProcess = (pid: number): void => {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already dead
  }
};

export const cleanupDevProcess = async (dev: DevProcess | null): Promise<void> => {
  if (!dev) return;

  dev.kill("SIGKILL");
  await dev.waitForExit(5000);
};

export { hasLeaks, runSilent };
