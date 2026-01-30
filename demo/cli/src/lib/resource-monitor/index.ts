import { Effect, Logger, LogLevel } from "effect";
import { writeFile } from "node:fs/promises";
import {
  assertAllPortsFree,
  assertAllPortsFreeWithPlatform,
  assertCleanState,
  assertCleanStateWithPlatform,
  assertMemoryDelta,
  assertNoLeaks,
  assertNoOrphanProcesses,
  assertProcessesDead,
} from "./assertions";
import { diffSnapshots, formatDiff, formatSnapshotSummary, hasLeaks } from "./diff";
import {
  MemoryLimitExceeded,
  MemoryPercentExceeded,
  OrphanedProcesses,
  PortStillBound,
  ProcessesStillAlive,
  ResourceLeaks,
} from "./errors";
import { PlatformLive, PlatformService, withPlatform } from "./platform";
import {
  createSnapshot,
  createSnapshotWithPlatform,
  findBosProcesses,
  isProcessAlive,
  waitForPortFree,
  waitForPortFreeWithPlatform,
  waitForProcessDeath,
} from "./snapshot";
import type {
  MemoryInfo,
  MonitorConfig,
  PortInfo,
  ProcessInfo,
  Snapshot,
  SnapshotDiff,
} from "./types";

export class ResourceMonitor {
  private config: MonitorConfig;
  private baseline: Snapshot | null = null;
  private snapshots: Snapshot[] = [];

  private constructor(config: MonitorConfig) {
    this.config = config;
  }

  static create = (
    config?: MonitorConfig
  ): Effect.Effect<ResourceMonitor, never, PlatformService> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Creating ResourceMonitor instance");
      return new ResourceMonitor(config || {});
    });

  static createWithPlatform = (
    config?: MonitorConfig
  ): Effect.Effect<ResourceMonitor> =>
    withPlatform(ResourceMonitor.create(config));

  snapshot(): Effect.Effect<Snapshot, never, PlatformService> {
    const self = this;
    return Effect.gen(function* () {
      const snap = yield* createSnapshot(self.config);
      self.snapshots.push(snap);
      return snap;
    });
  }

  snapshotWithPlatform(): Effect.Effect<Snapshot> {
    return withPlatform(this.snapshot());
  }

  setBaseline(): Effect.Effect<Snapshot, never, PlatformService> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo("Setting baseline snapshot");
      self.baseline = yield* self.snapshot();
      return self.baseline;
    });
  }

  setBaselineWithPlatform(): Effect.Effect<Snapshot> {
    return withPlatform(this.setBaseline());
  }

  getBaseline(): Effect.Effect<Snapshot | null> {
    return Effect.succeed(this.baseline);
  }

  clearBaseline(): Effect.Effect<void> {
    return Effect.sync(() => {
      this.baseline = null;
    });
  }

  getSnapshots(): Effect.Effect<Snapshot[]> {
    return Effect.succeed([...this.snapshots]);
  }

  clearSnapshots(): Effect.Effect<void> {
    return Effect.sync(() => {
      this.snapshots = [];
    });
  }

  diff(from: Snapshot, to: Snapshot): Effect.Effect<SnapshotDiff> {
    return Effect.sync(() => diffSnapshots(from, to));
  }

  diffFromBaseline(to: Snapshot): Effect.Effect<SnapshotDiff | null> {
    return Effect.sync(() => {
      if (!this.baseline) return null;
      return diffSnapshots(this.baseline, to);
    });
  }

  hasLeaks(diff: SnapshotDiff): Effect.Effect<boolean> {
    return Effect.sync(() => hasLeaks(diff));
  }

  assertAllPortsFree(
    ports?: number[]
  ): Effect.Effect<void, PortStillBound, PlatformService> {
    const portsToCheck =
      ports ||
      Object.keys(this.baseline?.ports || {}).map((p) => parseInt(p, 10));
    return assertAllPortsFree(portsToCheck);
  }

  assertAllPortsFreeWithPlatform(
    ports?: number[]
  ): Effect.Effect<void, PortStillBound> {
    const portsToCheck =
      ports ||
      Object.keys(this.baseline?.ports || {}).map((p) => parseInt(p, 10));
    return assertAllPortsFreeWithPlatform(portsToCheck);
  }

  assertNoOrphanProcesses(
    running: Snapshot,
    after: Snapshot
  ): Effect.Effect<void, OrphanedProcesses> {
    return assertNoOrphanProcesses(running, after);
  }

  assertMemoryDelta(
    baseline: Snapshot,
    after: Snapshot,
    options: { maxDeltaMB?: number; maxDeltaPercent?: number }
  ): Effect.Effect<void, MemoryLimitExceeded | MemoryPercentExceeded> {
    return assertMemoryDelta(baseline, after, options);
  }

  assertProcessesDead(pids: number[]): Effect.Effect<void, ProcessesStillAlive> {
    return assertProcessesDead(pids);
  }

  assertNoLeaks(diff: SnapshotDiff): Effect.Effect<void, ResourceLeaks> {
    return assertNoLeaks(diff);
  }

  assertCleanState(
    running: Snapshot
  ): Effect.Effect<void, PortStillBound | ProcessesStillAlive, PlatformService> {
    return assertCleanState(running);
  }

  assertCleanStateWithPlatform(
    running: Snapshot
  ): Effect.Effect<void, PortStillBound | ProcessesStillAlive> {
    return assertCleanStateWithPlatform(running);
  }

  waitForPortFree(
    port: number,
    timeoutMs?: number
  ): Effect.Effect<boolean, never, PlatformService> {
    return waitForPortFree(port, timeoutMs);
  }

  waitForPortFreeWithPlatform(
    port: number,
    timeoutMs?: number
  ): Effect.Effect<boolean> {
    return waitForPortFreeWithPlatform(port, timeoutMs);
  }

  waitForProcessDeath(pid: number, timeoutMs?: number): Effect.Effect<boolean> {
    return waitForProcessDeath(pid, timeoutMs);
  }

  formatSnapshot(snapshot: Snapshot): Effect.Effect<string> {
    return Effect.sync(() => formatSnapshotSummary(snapshot));
  }

  formatDiff(diff: SnapshotDiff): Effect.Effect<string> {
    return Effect.sync(() => formatDiff(diff));
  }

  export(filepath: string): Effect.Effect<void> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo(`Exporting monitor data to ${filepath}`);

      const data = {
        config: self.config,
        baseline: self.baseline,
        snapshots: self.snapshots,
        exportedAt: new Date().toISOString(),
        platform: process.platform,
      };

      yield* Effect.tryPromise({
        try: () => writeFile(filepath, JSON.stringify(data, null, 2)),
        catch: (e) => new Error(`Failed to export: ${e}`),
      });

      yield* Effect.logInfo(`Exported ${self.snapshots.length} snapshots`);
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  toJSON(): Effect.Effect<{
    config: MonitorConfig;
    baseline: Snapshot | null;
    snapshots: Snapshot[];
  }> {
    return Effect.succeed({
      config: this.config,
      baseline: this.baseline,
      snapshots: this.snapshots,
    });
  }
}

export const runWithLogging = <A, E>(
  effect: Effect.Effect<A, E, PlatformService>
): Promise<A> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.runPromise
  );

export const runWithInfo = <A, E>(
  effect: Effect.Effect<A, E, PlatformService>
): Promise<A> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.runPromise
  );

export const runSilent = <A, E>(
  effect: Effect.Effect<A, E, PlatformService>
): Promise<A> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Error),
    Effect.runPromise
  );

export {
  assertAllPortsFree,
  assertAllPortsFreeWithPlatform,
  assertCleanState,
  assertCleanStateWithPlatform,
  assertMemoryDelta,
  assertNoLeaks,
  assertNoOrphanProcesses,
  assertProcessesDead,
  createSnapshot,
  createSnapshotWithPlatform,
  diffSnapshots,
  findBosProcesses,
  formatDiff,
  formatSnapshotSummary,
  hasLeaks,
  isProcessAlive,
  MemoryLimitExceeded,
  MemoryPercentExceeded,
  OrphanedProcesses,
  PlatformLive,
  PlatformService,
  PortStillBound,
  ProcessesStillAlive,
  ResourceLeaks,
  waitForPortFree,
  waitForPortFreeWithPlatform,
  waitForProcessDeath,
  withPlatform,
};

export type {
  MemoryInfo,
  MonitorConfig,
  PortInfo,
  ProcessInfo,
  Snapshot,
  SnapshotDiff,
};
