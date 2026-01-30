import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  ResourceMonitor,
  assertAllPortsFreeWithPlatform,
  assertNoLeaks,
  createSnapshotWithPlatform,
  diffSnapshots,
  hasLeaks,
  runSilent
} from "../../src/lib/resource-monitor";
import {
  createMockServers,
  sleep,
  stopAllMockServers,
  type MockServer
} from "./mock-server";

const TEST_PORTS = [19990, 19991, 19992];

describe("ResourceMonitor Unit Tests", () => {
  let servers: MockServer[] = [];

  afterEach(async () => {
    stopAllMockServers(servers);
    servers = [];
    await sleep(100);
  });

  describe("createSnapshot", () => {
    it("should detect FREE ports when nothing is bound", async () => {
      const snapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.platform).toBe(process.platform);
      expect(snapshot.timestamp).toBeGreaterThan(0);

      for (const port of TEST_PORTS) {
        expect(snapshot.ports[port]).toBeDefined();
        expect(snapshot.ports[port].state).toBe("FREE");
      }
    });

    it("should detect LISTEN ports when servers are bound", async () => {
      servers = createMockServers(TEST_PORTS);
      await sleep(100);

      const snapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      for (const port of TEST_PORTS) {
        expect(snapshot.ports[port]).toBeDefined();
        expect(snapshot.ports[port].state).toBe("LISTEN");
        expect(snapshot.ports[port].pid).toBeGreaterThan(0);
      }
    });

    it("should include memory info", async () => {
      const snapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      expect(snapshot.memory).toBeDefined();
      expect(snapshot.memory.total).toBeGreaterThan(0);
      expect(snapshot.memory.free).toBeGreaterThan(0);
    });
  });

  describe("diffSnapshots", () => {
    it("should detect freed ports", async () => {
      servers = createMockServers(TEST_PORTS);
      await sleep(100);

      const beforeSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      stopAllMockServers(servers);
      servers = [];
      await sleep(200);

      const afterSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(beforeSnapshot, afterSnapshot);

      expect(diff.freedPorts).toHaveLength(TEST_PORTS.length);
      expect(diff.stillBoundPorts).toHaveLength(0);

      for (const port of TEST_PORTS) {
        expect(diff.freedPorts).toContain(port);
      }
    });

    it("should detect still-bound ports", async () => {
      servers = createMockServers(TEST_PORTS);
      await sleep(100);

      const beforeSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const afterSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(beforeSnapshot, afterSnapshot);

      expect(diff.stillBoundPorts).toHaveLength(TEST_PORTS.length);
      expect(diff.freedPorts).toHaveLength(0);
    });

    it("should compute memory delta", async () => {
      const snapshot1 = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      await sleep(50);

      const snapshot2 = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(snapshot1, snapshot2);

      expect(typeof diff.memoryDeltaBytes).toBe("number");
    });
  });

  describe("hasLeaks", () => {
    it("should return false when no leaks", async () => {
      servers = createMockServers([TEST_PORTS[0]]);
      await sleep(100);

      const runningSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      stopAllMockServers(servers);
      servers = [];
      await sleep(200);

      const afterSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(runningSnapshot, afterSnapshot);

      expect(hasLeaks(diff)).toBe(false);
    });

    it("should return true when ports still bound", async () => {
      servers = createMockServers([TEST_PORTS[0]]);
      await sleep(100);

      const runningSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const afterSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(runningSnapshot, afterSnapshot);

      expect(hasLeaks(diff)).toBe(true);
    });
  });

  describe("assertAllPortsFree", () => {
    it("should pass when all ports are free", async () => {
      await runSilent(assertAllPortsFreeWithPlatform(TEST_PORTS));
    });

    it("should fail when ports are bound", async () => {
      servers = createMockServers([TEST_PORTS[0]]);
      await sleep(100);

      await expect(
        runSilent(assertAllPortsFreeWithPlatform(TEST_PORTS))
      ).rejects.toThrow();
    });
  });

  describe("assertNoLeaks", () => {
    it("should pass when no leaks detected", async () => {
      servers = createMockServers([TEST_PORTS[0]]);
      await sleep(100);

      const runningSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      stopAllMockServers(servers);
      servers = [];
      await sleep(200);

      const afterSnapshot = await runSilent(
        createSnapshotWithPlatform({ ports: TEST_PORTS })
      );

      const diff = diffSnapshots(runningSnapshot, afterSnapshot);

      await runSilent(assertNoLeaks(diff));
    });
  });

  describe("ResourceMonitor class", () => {
    it("should create monitor instance", async () => {
      const monitor = await runSilent(
        ResourceMonitor.createWithPlatform({ ports: TEST_PORTS })
      );

      expect(monitor).toBeDefined();
    });

    it("should capture and diff snapshots", async () => {
      const monitor = await runSilent(
        ResourceMonitor.createWithPlatform({ ports: TEST_PORTS })
      );

      const baseline = await runSilent(monitor.setBaselineWithPlatform());
      expect(baseline).toBeDefined();

      servers = createMockServers([TEST_PORTS[0]]);
      await sleep(100);

      const running = await runSilent(monitor.snapshotWithPlatform());
      expect(running.ports[TEST_PORTS[0]].state).toBe("LISTEN");

      stopAllMockServers(servers);
      servers = [];
      await sleep(200);

      const after = await runSilent(monitor.snapshotWithPlatform());
      expect(after.ports[TEST_PORTS[0]].state).toBe("FREE");

      const diff = await Effect.runPromise(monitor.diff(running, after));
      expect(diff.freedPorts).toContain(TEST_PORTS[0]);
    });
  });
});
