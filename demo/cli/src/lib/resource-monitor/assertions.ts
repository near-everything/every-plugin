import { Effect } from "effect";
import {
  MemoryLimitExceeded,
  MemoryPercentExceeded,
  OrphanedProcesses,
  PortStillBound,
  ProcessesStillAlive,
  ResourceLeaks,
} from "./errors";
import { PlatformService, withPlatform } from "./platform";
import { isProcessAlive } from "./snapshot";
import type { Snapshot, SnapshotDiff } from "./types";

export const assertAllPortsFree = (
  ports: number[]
): Effect.Effect<void, PortStillBound, PlatformService> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Asserting ${ports.length} ports are free`);

    const platform = yield* PlatformService;
    const portInfo = yield* platform.getPortInfo(ports);

    const bound: Array<{
      port: number;
      pid: number | null;
      command: string | null;
    }> = [];

    for (const [portStr, info] of Object.entries(portInfo)) {
      if (info.state !== "FREE") {
        bound.push({
          port: parseInt(portStr, 10),
          pid: info.pid,
          command: info.command,
        });
      }
    }

    if (bound.length > 0) {
      yield* Effect.logError(`${bound.length} ports still bound:`);
      for (const p of bound) {
        yield* Effect.logError(`  :${p.port} ← PID ${p.pid} (${p.command})`);
      }
      return yield* Effect.fail(new PortStillBound({ ports: bound }));
    }

    yield* Effect.logInfo(`All ${ports.length} ports are free ✓`);
  });

export const assertAllPortsFreeWithPlatform = (
  ports: number[]
): Effect.Effect<void, PortStillBound> =>
  withPlatform(assertAllPortsFree(ports));

export const assertNoOrphanProcesses = (
  runningSnapshot: Snapshot,
  afterSnapshot: Snapshot
): Effect.Effect<void, OrphanedProcesses> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Checking for orphaned processes");

    const runningPids = new Set(runningSnapshot.processes.map((p) => p.pid));

    const orphans: Array<{ pid: number; command: string; rss: number }> = [];

    for (const proc of runningSnapshot.processes) {
      if (!runningPids.has(proc.pid)) continue;

      const stillInAfter = afterSnapshot.processes.some(
        (p) => p.pid === proc.pid
      );
      if (stillInAfter) continue;

      const alive = yield* isProcessAlive(proc.pid);
      if (alive) {
        orphans.push({
          pid: proc.pid,
          command: proc.command,
          rss: proc.rss,
        });
      }
    }

    if (orphans.length > 0) {
      yield* Effect.logError(`${orphans.length} orphaned processes found:`);
      for (const p of orphans) {
        yield* Effect.logError(
          `  PID ${p.pid}: ${p.command} (${(p.rss / 1024 / 1024).toFixed(1)}MB)`
        );
      }
      return yield* Effect.fail(new OrphanedProcesses({ processes: orphans }));
    }

    yield* Effect.logInfo("No orphaned processes ✓");
  });

export const assertMemoryDelta = (
  baseline: Snapshot,
  after: Snapshot,
  options: { maxDeltaMB?: number; maxDeltaPercent?: number }
): Effect.Effect<void, MemoryLimitExceeded | MemoryPercentExceeded> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Checking memory delta");

    const deltaMB =
      (after.memory.processRss - baseline.memory.processRss) / 1024 / 1024;

    yield* Effect.logDebug(
      `Memory delta: ${deltaMB >= 0 ? "+" : ""}${deltaMB.toFixed(1)}MB`
    );

    if (options.maxDeltaMB !== undefined && deltaMB > options.maxDeltaMB) {
      yield* Effect.logError(
        `Memory delta ${deltaMB.toFixed(1)}MB exceeds max ${options.maxDeltaMB}MB`
      );
      return yield* Effect.fail(
        new MemoryLimitExceeded({
          deltaMB,
          limitMB: options.maxDeltaMB,
          baselineRss: baseline.memory.processRss,
          afterRss: after.memory.processRss,
        })
      );
    }

    if (options.maxDeltaPercent !== undefined && baseline.memory.processRss > 0) {
      const deltaPercent =
        ((after.memory.processRss - baseline.memory.processRss) /
          baseline.memory.processRss) *
        100;

      yield* Effect.logDebug(
        `Memory delta: ${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`
      );

      if (deltaPercent > options.maxDeltaPercent) {
        yield* Effect.logError(
          `Memory delta ${deltaPercent.toFixed(1)}% exceeds max ${options.maxDeltaPercent}%`
        );
        return yield* Effect.fail(
          new MemoryPercentExceeded({
            deltaPercent,
            limitPercent: options.maxDeltaPercent,
            baselineRss: baseline.memory.processRss,
            afterRss: after.memory.processRss,
          })
        );
      }
    }

    yield* Effect.logInfo("Memory delta within limits ✓");
  });

export const assertProcessesDead = (
  pids: number[]
): Effect.Effect<void, ProcessesStillAlive> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Asserting ${pids.length} processes are dead`);

    const stillAlive: number[] = [];

    for (const pid of pids) {
      const alive = yield* isProcessAlive(pid);
      if (alive) {
        stillAlive.push(pid);
      }
    }

    if (stillAlive.length > 0) {
      yield* Effect.logError(
        `${stillAlive.length} processes still alive: ${stillAlive.join(", ")}`
      );
      return yield* Effect.fail(new ProcessesStillAlive({ pids: stillAlive }));
    }

    yield* Effect.logInfo(`All ${pids.length} processes are dead ✓`);
  });

export const assertNoLeaks = (
  diff: SnapshotDiff
): Effect.Effect<void, ResourceLeaks> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Checking for resource leaks");

    if (
      diff.orphanedProcesses.length > 0 ||
      diff.stillBoundPorts.length > 0
    ) {
      yield* Effect.logError("Resource leaks detected:");

      for (const proc of diff.orphanedProcesses) {
        yield* Effect.logError(
          `  Orphaned PID ${proc.pid}: ${proc.command} (${(proc.rss / 1024 / 1024).toFixed(1)}MB)`
        );
      }

      for (const port of diff.stillBoundPorts) {
        yield* Effect.logError(
          `  Port :${port.port} still bound to PID ${port.pid} (${port.command})`
        );
      }

      return yield* Effect.fail(
        new ResourceLeaks({
          orphanedProcesses: diff.orphanedProcesses,
          stillBoundPorts: diff.stillBoundPorts,
        })
      );
    }

    yield* Effect.logInfo("No resource leaks detected ✓");
  });

export const assertCleanState = (
  baseline: Snapshot
): Effect.Effect<void, PortStillBound | ProcessesStillAlive, PlatformService> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Asserting clean state");

    const ports = Object.keys(baseline.ports).map((p) => parseInt(p, 10));
    yield* assertAllPortsFree(ports);

    const pids = baseline.processes.map((p) => p.pid);
    if (pids.length > 0) {
      yield* assertProcessesDead(pids);
    }

    yield* Effect.logInfo("Clean state verified ✓");
  });

export const assertCleanStateWithPlatform = (
  baseline: Snapshot
): Effect.Effect<void, PortStillBound | ProcessesStillAlive> =>
  withPlatform(assertCleanState(baseline));
