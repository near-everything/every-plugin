import { Context, Effect } from "effect";

export interface PortInfo {
  port: number;
  pid: number | null;
  command: string | null;
  state: "LISTEN" | "ESTABLISHED" | "TIME_WAIT" | "FREE";
  name?: string;
}

export interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  args: string[];
  rss: number;
  children: number[];
  startTime?: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  processRss: number;
}

export interface Snapshot {
  timestamp: number;
  configPath: string | null;
  ports: Record<number, PortInfo>;
  processes: ProcessInfo[];
  memory: MemoryInfo;
  platform: NodeJS.Platform;
}

export interface SnapshotDiff {
  from: Snapshot;
  to: Snapshot;
  orphanedProcesses: ProcessInfo[];
  stillBoundPorts: PortInfo[];
  freedPorts: number[];
  memoryDeltaBytes: number;
  newProcesses: ProcessInfo[];
  killedProcesses: ProcessInfo[];
}

export interface MonitorConfig {
  ports?: number[];
  processPatterns?: string[];
  refreshInterval?: number;
  configPath?: string;
}

export interface PlatformOperations {
  readonly getPortInfo: (
    ports: number[]
  ) => Effect.Effect<Record<number, PortInfo>, never>;

  readonly getProcessTree: (
    rootPids: number[]
  ) => Effect.Effect<ProcessInfo[], never>;

  readonly getMemoryInfo: () => Effect.Effect<MemoryInfo, never>;

  readonly getAllProcesses: () => Effect.Effect<ProcessInfo[], never>;

  readonly findChildProcesses: (pid: number) => Effect.Effect<number[], never>;
}

export class PlatformService extends Context.Tag("PlatformService")<
  PlatformService,
  PlatformOperations
>() {}
