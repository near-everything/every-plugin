import { Effect } from "effect";
import { getConfigPath, getPortsFromConfig, loadConfig } from "../../config";
import { PlatformService, withPlatform } from "./platform";
import type { MonitorConfig, ProcessInfo, Snapshot } from "./types";

export const getPortsToMonitor = (
  config?: MonitorConfig
): Effect.Effect<number[]> =>
  Effect.gen(function* () {
    if (config?.ports && config.ports.length > 0) {
      yield* Effect.logDebug(
        `Using configured ports: ${config.ports.join(", ")}`
      );
      return config.ports;
    }

    return yield* Effect.try({
      try: () => {
        loadConfig(config?.configPath);
        const portConfig = getPortsFromConfig();
        const ports = [portConfig.host, portConfig.ui, portConfig.api].filter(
          (p) => p > 0
        );
        return ports;
      },
      catch: () => new Error("Config not found"),
    }).pipe(Effect.catchAll(() => Effect.succeed([3000, 3002, 3014])));
  });

export const getConfigPathSafe = (
  config?: MonitorConfig
): Effect.Effect<string | null> =>
  Effect.try({
    try: () => {
      loadConfig(config?.configPath);
      return getConfigPath();
    },
    catch: () => new Error("Config not found"),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

export const createSnapshot = (
  config?: MonitorConfig
): Effect.Effect<Snapshot, never, PlatformService> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Creating system snapshot");

    const platform = yield* PlatformService;
    const ports = yield* getPortsToMonitor(config);
    const configPath = yield* getConfigPathSafe(config);

    yield* Effect.logDebug(`Monitoring ports: ${ports.join(", ")}`);

    const portInfo = yield* platform.getPortInfo(ports);
    const boundPorts = Object.values(portInfo).filter(
      (p) => p.state !== "FREE"
    );

    yield* Effect.logInfo(`Found ${boundPorts.length} bound ports`);

    const rootPids = boundPorts
      .map((p) => p.pid)
      .filter((pid): pid is number => pid !== null);

    const processes =
      rootPids.length > 0 ? yield* platform.getProcessTree(rootPids) : [];

    yield* Effect.logInfo(`Tracked ${processes.length} processes in tree`);

    const memory = yield* platform.getMemoryInfo();

    const totalRss = processes.reduce((sum, p) => sum + p.rss, 0);
    memory.processRss = totalRss;

    yield* Effect.logDebug(
      `Total process RSS: ${(totalRss / 1024 / 1024).toFixed(1)}MB`
    );

    const snapshot: Snapshot = {
      timestamp: Date.now(),
      configPath,
      ports: portInfo,
      processes,
      memory,
      platform: process.platform,
    };

    yield* Effect.logInfo(
      `Snapshot created at ${new Date(snapshot.timestamp).toISOString()}`
    );

    return snapshot;
  });

export const createSnapshotWithPlatform = (
  config?: MonitorConfig
): Effect.Effect<Snapshot> => withPlatform(createSnapshot(config));

export const findProcessesByPattern = (
  patterns: string[]
): Effect.Effect<ProcessInfo[], never, PlatformService> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(
      `Finding processes matching: ${patterns.join(", ")}`
    );

    const platform = yield* PlatformService;
    const allProcesses = yield* platform.getAllProcesses();

    const matched = allProcesses.filter((proc) =>
      patterns.some((pattern) =>
        proc.command.toLowerCase().includes(pattern.toLowerCase())
      )
    );

    yield* Effect.logInfo(
      `Found ${matched.length} processes matching patterns`
    );

    return matched;
  });

export const findBosProcesses = (): Effect.Effect<
  ProcessInfo[],
  never,
  PlatformService
> => {
  const patterns = ["bun", "rspack", "rsbuild", "esbuild", "webpack", "node"];
  return findProcessesByPattern(patterns);
};

export const isProcessAlive = (pid: number): Effect.Effect<boolean> =>
  Effect.sync(() => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });

export const waitForProcessDeath = (
  pid: number,
  timeoutMs = 5000
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(
      `Waiting for PID ${pid} to die (timeout: ${timeoutMs}ms)`
    );
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const alive = yield* isProcessAlive(pid);
      if (!alive) {
        yield* Effect.logDebug(`PID ${pid} is dead`);
        return true;
      }
      yield* Effect.sleep("100 millis");
    }

    const finalAlive = yield* isProcessAlive(pid);
    if (finalAlive) {
      yield* Effect.logWarning(`PID ${pid} still alive after ${timeoutMs}ms`);
    }
    return !finalAlive;
  });

export const waitForPortFree = (
  port: number,
  timeoutMs = 5000
): Effect.Effect<boolean, never, PlatformService> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(
      `Waiting for port :${port} to be free (timeout: ${timeoutMs}ms)`
    );
    const platform = yield* PlatformService;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const portInfo = yield* platform.getPortInfo([port]);
      if (portInfo[port].state === "FREE") {
        yield* Effect.logDebug(`Port :${port} is now free`);
        return true;
      }
      yield* Effect.sleep("100 millis");
    }

    const finalPortInfo = yield* platform.getPortInfo([port]);
    const isFree = finalPortInfo[port].state === "FREE";

    if (!isFree) {
      yield* Effect.logWarning(
        `Port :${port} still bound after ${timeoutMs}ms`
      );
    }

    return isFree;
  });

export const waitForPortFreeWithPlatform = (
  port: number,
  timeoutMs = 5000
): Effect.Effect<boolean> => withPlatform(waitForPortFree(port, timeoutMs));
