import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Effect } from "effect";
import {
  createTestContext,
  spawnDevServer,
  spawnStartServer,
  waitForPortBound,
  waitForPortFree,
  captureBaseline,
  captureRunning,
  captureAfter,
  getDiff,
  getBoundPorts,
  getFreePorts,
  cleanupDevProcess,
  hasLeaks,
  sleep,
  runSilent,
  DEV_PORTS,
  START_PORT,
  type TestContext,
  type DevProcess,
} from "../helpers/process-tracker";
import {
  assertAllPortsFreeWithPlatform,
  assertNoOrphanProcesses,
  assertNoLeaks,
  findBosProcesses,
  createSnapshotWithPlatform,
} from "../../src/lib/resource-monitor";

const IS_WINDOWS = process.platform === "win32";
const STARTUP_TIMEOUT = 60000;
const CLEANUP_TIMEOUT = 15000;
const PORT_FREE_TIMEOUT = 15000;

const waitForAllPortsFree = async (
  ports: number[],
  timeout = PORT_FREE_TIMEOUT
): Promise<boolean> => {
  for (const port of ports) {
    const freed = await waitForPortFree(port, timeout);
    if (!freed) return false;
  }
  return true;
};

describe("Dev Server Lifecycle Tests", () => {
  let ctx: TestContext;
  let devProcess: DevProcess | null = null;

  beforeAll(async () => {
    ctx = await createTestContext(DEV_PORTS);
  });

  afterEach(async () => {
    if (devProcess) {
      await cleanupDevProcess(devProcess);
      devProcess = null;
    }
    await sleep(1000);
  });

  afterAll(async () => {
    if (devProcess) {
      await cleanupDevProcess(devProcess);
    }
  });

  describe("SIGTERM cleanup", () => {
    it(
      "should free all ports after SIGTERM",
      async () => {
        await captureBaseline(ctx);
        const baselineBound = getBoundPorts(ctx.baseline!);
        expect(baselineBound.filter((p) => DEV_PORTS.includes(p))).toHaveLength(0);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);
        const runningBound = getBoundPorts(ctx.running!);
        expect(runningBound).toContain(3000);

        if (IS_WINDOWS) {
          devProcess.kill();
        } else {
          devProcess.kill("SIGTERM");
        }

        const allFreed = await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const afterBound = getBoundPorts(ctx.after!);

        expect(afterBound.filter((p) => DEV_PORTS.includes(p))).toHaveLength(0);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should have no orphaned processes after SIGTERM",
      async () => {
        await captureBaseline(ctx);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);
        const runningProcessCount = ctx.running!.processes.length;
        expect(runningProcessCount).toBeGreaterThan(0);

        if (IS_WINDOWS) {
          devProcess.kill();
        } else {
          devProcess.kill("SIGTERM");
        }

        await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        expect(diff.orphanedProcesses).toHaveLength(0);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should pass assertNoLeaks after SIGTERM",
      async () => {
        await captureBaseline(ctx);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        if (IS_WINDOWS) {
          devProcess.kill();
        } else {
          devProcess.kill("SIGTERM");
        }

        await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        expect(hasLeaks(diff)).toBe(false);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should pass Effect-based assertNoLeaks after SIGTERM",
      async () => {
        await captureBaseline(ctx);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        if (IS_WINDOWS) {
          devProcess.kill();
        } else {
          devProcess.kill("SIGTERM");
        }

        await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        await runSilent(assertNoLeaks(diff));
        await runSilent(assertAllPortsFreeWithPlatform(DEV_PORTS));
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );
  });

  describe.skipIf(IS_WINDOWS)("SIGINT cleanup (Ctrl+C)", () => {
    it(
      "should free all ports after SIGINT",
      async () => {
        await captureBaseline(ctx);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        devProcess.kill("SIGINT");

        await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const afterBound = getBoundPorts(ctx.after!);

        expect(afterBound.filter((p) => DEV_PORTS.includes(p))).toHaveLength(0);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should have no orphaned processes after SIGINT",
      async () => {
        await captureBaseline(ctx);

        devProcess = spawnDevServer();
        const ready = await waitForPortBound(3000, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        devProcess.kill("SIGINT");

        await waitForAllPortsFree(DEV_PORTS, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        expect(diff.orphanedProcesses).toHaveLength(0);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );
  });

  describe("process detection (no dev server)", () => {
    it("should detect bos-related processes", async () => {
      const bosProcesses = await runSilent(findBosProcesses());
      expect(Array.isArray(bosProcesses)).toBe(true);
    });

    it("should capture port states without running dev", async () => {
      const snapshot = await runSilent(createSnapshotWithPlatform({ ports: DEV_PORTS }));

      expect(snapshot).toBeDefined();
      expect(snapshot.ports).toBeDefined();
      expect(snapshot.platform).toBe(process.platform);

      for (const port of DEV_PORTS) {
        expect(snapshot.ports[port]).toBeDefined();
        expect(["FREE", "LISTEN", "ESTABLISHED", "TIME_WAIT"]).toContain(
          snapshot.ports[port].state
        );
      }
    });

    it("should compute diff between snapshots", async () => {
      const snap1 = await runSilent(createSnapshotWithPlatform({ ports: DEV_PORTS }));
      await sleep(100);
      const snap2 = await runSilent(createSnapshotWithPlatform({ ports: DEV_PORTS }));

      const diff = getDiff(snap1, snap2);

      expect(diff).toBeDefined();
      expect(diff.from).toBe(snap1);
      expect(diff.to).toBe(snap2);
      expect(Array.isArray(diff.orphanedProcesses)).toBe(true);
      expect(Array.isArray(diff.stillBoundPorts)).toBe(true);
      expect(Array.isArray(diff.freedPorts)).toBe(true);
    });

    it("should assert unused ports are free", async () => {
      const unusedPorts = [19999, 19998, 19997];
      await runSilent(assertAllPortsFreeWithPlatform(unusedPorts));
    });

    it("should verify getFreePorts returns free ports", async () => {
      const snapshot = await runSilent(createSnapshotWithPlatform({ ports: [19999, 19998] }));
      const free = getFreePorts(snapshot);
      expect(free).toContain(19999);
      expect(free).toContain(19998);
    });
  });
});

describe("Start Server Lifecycle Tests", () => {
  let ctx: TestContext;
  let startProcess: DevProcess | null = null;

  beforeAll(async () => {
    ctx = await createTestContext([START_PORT]);
  });

  afterEach(async () => {
    if (startProcess) {
      await cleanupDevProcess(startProcess);
      startProcess = null;
    }
    await sleep(1000);
  });

  afterAll(async () => {
    if (startProcess) {
      await cleanupDevProcess(startProcess);
    }
  });

  describe("bos start cleanup", () => {
    it(
      "should free port 3000 after termination",
      async () => {
        await captureBaseline(ctx);
        const baselineBound = getBoundPorts(ctx.baseline!);
        expect(baselineBound).not.toContain(START_PORT);

        startProcess = spawnStartServer();
        const ready = await waitForPortBound(START_PORT, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);
        const runningBound = getBoundPorts(ctx.running!);
        expect(runningBound).toContain(START_PORT);

        if (IS_WINDOWS) {
          startProcess!.kill();
        } else {
          startProcess!.kill("SIGTERM");
        }

        const freed = await waitForPortFree(START_PORT, PORT_FREE_TIMEOUT);
        expect(freed).toBe(true);

        await captureAfter(ctx);
        const afterBound = getBoundPorts(ctx.after!);

        expect(afterBound).not.toContain(START_PORT);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should have no orphaned processes after termination",
      async () => {
        await captureBaseline(ctx);

        startProcess = spawnStartServer();
        const ready = await waitForPortBound(START_PORT, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        if (IS_WINDOWS) {
          startProcess!.kill();
        } else {
          startProcess!.kill("SIGTERM");
        }

        await waitForPortFree(START_PORT, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        expect(diff.orphanedProcesses).toHaveLength(0);
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );

    it(
      "should pass assertNoLeaks after termination",
      async () => {
        await captureBaseline(ctx);

        startProcess = spawnStartServer();
        const ready = await waitForPortBound(START_PORT, STARTUP_TIMEOUT);
        expect(ready).toBe(true);

        await captureRunning(ctx);

        if (IS_WINDOWS) {
          startProcess!.kill();
        } else {
          startProcess!.kill("SIGTERM");
        }

        await waitForPortFree(START_PORT, PORT_FREE_TIMEOUT);

        await captureAfter(ctx);
        const diff = getDiff(ctx.running!, ctx.after!);

        expect(hasLeaks(diff)).toBe(false);
        await runSilent(assertNoLeaks(diff));
      },
      STARTUP_TIMEOUT + CLEANUP_TIMEOUT
    );
  });
});
