import { Data } from "effect";

export class SessionTimeout extends Data.TaggedError("SessionTimeout")<{
  readonly timeoutMs: number;
  readonly elapsedMs: number;
}> {
  get message() {
    return `Session timed out after ${this.elapsedMs}ms (limit: ${this.timeoutMs}ms)`;
  }
}

export class BrowserLaunchFailed extends Data.TaggedError("BrowserLaunchFailed")<{
  readonly reason: string;
  readonly headless: boolean;
}> {
  get message() {
    return `Failed to launch browser (headless: ${this.headless}): ${this.reason}`;
  }
}

export class ServerStartFailed extends Data.TaggedError("ServerStartFailed")<{
  readonly server: string;
  readonly port: number;
  readonly reason: string;
}> {
  get message() {
    return `Failed to start ${this.server} on port ${this.port}: ${this.reason}`;
  }
}

export class ServerNotReady extends Data.TaggedError("ServerNotReady")<{
  readonly servers: string[];
  readonly timeoutMs: number;
}> {
  get message() {
    return `Servers not ready after ${this.timeoutMs}ms: ${this.servers.join(", ")}`;
  }
}

export class FlowExecutionFailed extends Data.TaggedError("FlowExecutionFailed")<{
  readonly flowName: string;
  readonly step: string;
  readonly reason: string;
}> {
  get message() {
    return `Flow "${this.flowName}" failed at step "${this.step}": ${this.reason}`;
  }
}

export class SnapshotFailed extends Data.TaggedError("SnapshotFailed")<{
  readonly reason: string;
}> {
  get message() {
    return `Failed to capture snapshot: ${this.reason}`;
  }
}

export class ExportFailed extends Data.TaggedError("ExportFailed")<{
  readonly path: string;
  readonly reason: string;
}> {
  get message() {
    return `Failed to export session to ${this.path}: ${this.reason}`;
  }
}

export class BrowserMetricsFailed extends Data.TaggedError("BrowserMetricsFailed")<{
  readonly reason: string;
}> {
  get message() {
    return `Failed to collect browser metrics: ${this.reason}`;
  }
}

export class PopupNotDetected extends Data.TaggedError("PopupNotDetected")<{
  readonly timeoutMs: number;
}> {
  get message() {
    return `Popup window not detected within ${this.timeoutMs}ms`;
  }
}

export class AuthenticationFailed extends Data.TaggedError("AuthenticationFailed")<{
  readonly step: string;
  readonly reason: string;
}> {
  get message() {
    return `Authentication failed at "${this.step}": ${this.reason}`;
  }
}

export type SessionRecorderError =
  | SessionTimeout
  | BrowserLaunchFailed
  | ServerStartFailed
  | ServerNotReady
  | FlowExecutionFailed
  | SnapshotFailed
  | ExportFailed
  | BrowserMetricsFailed
  | PopupNotDetected
  | AuthenticationFailed;
