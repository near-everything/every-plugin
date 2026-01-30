import { Data } from "effect";
import type { PortInfo, ProcessInfo } from "./types";

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly command: string;
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;
}> {
  get message() {
    return `Command '${this.command} ${this.args.join(" ")}' failed with exit code ${this.exitCode}: ${this.stderr}`;
  }
}

export class CommandTimeout extends Data.TaggedError("CommandTimeout")<{
  readonly command: string;
  readonly timeoutMs: number;
}> {
  get message() {
    return `Command '${this.command}' timed out after ${this.timeoutMs}ms`;
  }
}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly source: string;
  readonly raw: string;
  readonly reason: string;
}> {
  get message() {
    return `Failed to parse ${this.source}: ${this.reason}`;
  }
}

export class PortStillBound extends Data.TaggedError("PortStillBound")<{
  readonly ports: Array<{ port: number; pid: number | null; command: string | null }>;
}> {
  get message() {
    const portList = this.ports.map((p) => `:${p.port} (PID ${p.pid})`).join(", ");
    return `Expected ports to be free, but still bound: ${portList}`;
  }
}

export class OrphanedProcesses extends Data.TaggedError("OrphanedProcesses")<{
  readonly processes: Array<{ pid: number; command: string; rss: number }>;
}> {
  get message() {
    return `Found ${this.processes.length} orphaned processes still running`;
  }
}

export class MemoryLimitExceeded extends Data.TaggedError("MemoryLimitExceeded")<{
  readonly deltaMB: number;
  readonly limitMB: number;
  readonly baselineRss: number;
  readonly afterRss: number;
}> {
  get message() {
    return `Memory delta ${this.deltaMB.toFixed(1)} MB exceeds limit ${this.limitMB} MB`;
  }
}

export class MemoryPercentExceeded extends Data.TaggedError("MemoryPercentExceeded")<{
  readonly deltaPercent: number;
  readonly limitPercent: number;
  readonly baselineRss: number;
  readonly afterRss: number;
}> {
  get message() {
    return `Memory delta ${this.deltaPercent.toFixed(1)}% exceeds limit ${this.limitPercent}%`;
  }
}

export class ProcessesStillAlive extends Data.TaggedError("ProcessesStillAlive")<{
  readonly pids: number[];
}> {
  get message() {
    return `Expected processes to be dead, but ${this.pids.length} still alive: ${this.pids.join(", ")}`;
  }
}

export class ResourceLeaks extends Data.TaggedError("ResourceLeaks")<{
  readonly orphanedProcesses: ProcessInfo[];
  readonly stillBoundPorts: PortInfo[];
}> {
  get message() {
    const parts: string[] = [];
    if (this.orphanedProcesses.length > 0) {
      parts.push(`${this.orphanedProcesses.length} orphaned processes`);
    }
    if (this.stillBoundPorts.length > 0) {
      parts.push(`${this.stillBoundPorts.length} ports still bound`);
    }
    return `Resource leaks detected: ${parts.join(", ")}`;
  }
}

export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly path: string | undefined;
}> {
  get message() {
    return this.path
      ? `Config not found at ${this.path}`
      : `No bos.config.json found in project`;
  }
}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string;
  readonly reason: string;
}> {
  get message() {
    return `Failed to read ${this.path}: ${this.reason}`;
  }
}

export type MonitorError =
  | CommandFailed
  | CommandTimeout
  | ParseError
  | PortStillBound
  | OrphanedProcesses
  | MemoryLimitExceeded
  | MemoryPercentExceeded
  | ProcessesStillAlive
  | ResourceLeaks
  | ConfigNotFound
  | FileReadError;
