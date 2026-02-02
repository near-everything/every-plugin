import { Effect, Logger, LogLevel } from "effect";
import { createSnapshotWithPlatform, PlatformLive, runSilent } from "../resource-monitor";
import type { Snapshot } from "../resource-monitor";
import {
  type SessionRecorderError,
  SessionTimeout,
  SnapshotFailed,
} from "./errors";
import {
  type BrowserHandle,
  closeBrowser,
  getBrowserMetrics,
  launchBrowser,
} from "./playwright";
import {
  exportHTMLReport,
  exportJSON,
  formatEventTimeline,
  formatReportSummary,
  generateReport,
} from "./report";
import {
  checkPortsAvailable,
  shutdownServers,
  startServers,
  waitForPortFree,
} from "./server";
import {
  DEFAULT_SESSION_CONFIG,
  type BrowserMetrics,
  type SessionConfig,
  type SessionEvent,
  type SessionEventType,
  type SessionReport,
  type ServerOrchestrator,
} from "./types";

let eventCounter = 0;

const generateEventId = (): string => {
  eventCounter += 1;
  return `evt_${Date.now()}_${eventCounter}`;
};

const generateSessionId = (): string => {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export class SessionRecorder {
  private config: SessionConfig;
  private sessionId: string;
  private events: SessionEvent[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private serverOrchestrator: ServerOrchestrator | null = null;
  private browserHandle: BrowserHandle | null = null;
  private isRecording = false;

  private constructor(config: SessionConfig) {
    this.config = config;
    this.sessionId = generateSessionId();
  }

  static create = (
    config?: Partial<SessionConfig>
  ): Effect.Effect<SessionRecorder> =>
    Effect.gen(function* () {
      const fullConfig = { ...DEFAULT_SESSION_CONFIG, ...config };
      yield* Effect.logInfo(`Creating SessionRecorder: ${JSON.stringify(fullConfig)}`);
      return new SessionRecorder(fullConfig);
    });

  getConfig(): SessionConfig {
    return { ...this.config };
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getEvents(): SessionEvent[] {
    return [...this.events];
  }

  isActive(): boolean {
    return this.isRecording;
  }

  takeSnapshot(): Effect.Effect<Snapshot, SnapshotFailed> {
    const self = this;
    return Effect.gen(function* () {
      const snapshot = yield* Effect.tryPromise({
        try: () => runSilent(createSnapshotWithPlatform({ ports: self.config.ports })),
        catch: (e) => new SnapshotFailed({ reason: String(e) }),
      });
      return snapshot;
    });
  }

  recordEvent(
    type: SessionEventType,
    label: string,
    metadata?: Record<string, unknown>
  ): Effect.Effect<SessionEvent, SnapshotFailed> {
    const self = this;
    return Effect.gen(function* () {
      const snapshot = yield* self.takeSnapshot();

      let browserMetrics: BrowserMetrics | undefined;
      if (self.browserHandle) {
        const metricsResult = yield* Effect.either(
          getBrowserMetrics(self.browserHandle.page)
        );
        if (metricsResult._tag === "Right") {
          browserMetrics = metricsResult.right;
        }
      }

      const event: SessionEvent = {
        id: generateEventId(),
        timestamp: Date.now(),
        type,
        label,
        snapshot,
        browserMetrics,
        url: self.browserHandle?.page.url(),
        metadata,
      };

      self.events.push(event);
      yield* Effect.logDebug(`Event recorded: ${type} - ${label}`);

      return event;
    });
  }

  startServers(
    mode: "start" | "dev" = "start"
  ): Effect.Effect<void, SessionRecorderError> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo(`Starting servers in ${mode} mode`);

      const portsAvailable = yield* checkPortsAvailable(self.config.ports);
      if (!portsAvailable) {
        yield* Effect.logWarning("Some ports already in use - proceeding anyway");
      }

      const orchestrator = yield* startServers(mode, {
        port: self.config.ports[0],
      });

      self.serverOrchestrator = orchestrator;
      yield* Effect.logInfo("Servers started successfully");
    });
  }

  stopServers(): Effect.Effect<void> {
    const self = this;
    return Effect.gen(function* () {
      if (self.serverOrchestrator) {
        yield* shutdownServers(self.serverOrchestrator);
        self.serverOrchestrator = null;
      }
    });
  }

  launchBrowser(): Effect.Effect<BrowserHandle, SessionRecorderError> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo(`Launching browser (headless: ${self.config.headless})`);

      const handle = yield* launchBrowser(self.config.headless);
      self.browserHandle = handle;

      return handle;
    });
  }

  closeBrowser(): Effect.Effect<void> {
    const self = this;
    return Effect.gen(function* () {
      if (self.browserHandle) {
        yield* closeBrowser(self.browserHandle);
        self.browserHandle = null;
      }
    });
  }

  getBrowser(): BrowserHandle | null {
    return this.browserHandle;
  }

  startRecording(): Effect.Effect<void, SnapshotFailed> {
    const self = this;
    return Effect.gen(function* () {
      if (self.isRecording) {
        yield* Effect.logWarning("Already recording");
        return;
      }

      self.isRecording = true;
      self.startTime = Date.now();
      self.events = [];

      yield* Effect.logInfo("Starting session recording");

      yield* self.recordEvent("baseline", "session_start");

      if (self.config.snapshotIntervalMs > 0) {
        self.intervalHandle = setInterval(() => {
          Effect.runPromise(
            self.recordEvent("interval", "auto_snapshot").pipe(
              Effect.catchAll(() => Effect.void)
            )
          );
        }, self.config.snapshotIntervalMs);
      }

      yield* Effect.logInfo(`Recording started with ${self.config.snapshotIntervalMs}ms interval`);
    });
  }

  stopRecording(): Effect.Effect<SessionReport, SnapshotFailed> {
    const self = this;
    return Effect.gen(function* () {
      if (!self.isRecording) {
        yield* Effect.logWarning("Not recording");
        return generateReport(
          self.sessionId,
          self.config,
          self.events,
          self.startTime,
          Date.now()
        );
      }

      if (self.intervalHandle) {
        clearInterval(self.intervalHandle);
        self.intervalHandle = null;
      }

      yield* self.recordEvent("custom", "session_end");

      self.isRecording = false;
      self.endTime = Date.now();

      yield* Effect.logInfo("Recording stopped");

      const report = generateReport(
        self.sessionId,
        self.config,
        self.events,
        self.startTime,
        self.endTime
      );

      return report;
    });
  }

  exportReport(
    filepath: string,
    format: "json" | "html" = "json"
  ): Effect.Effect<void, SessionRecorderError> {
    const self = this;
    return Effect.gen(function* () {
      const report = generateReport(
        self.sessionId,
        self.config,
        self.events,
        self.startTime,
        self.endTime || Date.now()
      );

      if (format === "html") {
        yield* exportHTMLReport(report, filepath);
      } else {
        yield* exportJSON(report, filepath);
      }
    });
  }

  generateReport(): SessionReport {
    return generateReport(
      this.sessionId,
      this.config,
      this.events,
      this.startTime,
      this.endTime || Date.now()
    );
  }

  printSummary(): Effect.Effect<void> {
    const self = this;
    return Effect.sync(() => {
      const report = self.generateReport();
      console.log(formatReportSummary(report));
    });
  }

  printTimeline(): Effect.Effect<void> {
    const self = this;
    return Effect.sync(() => {
      console.log(formatEventTimeline(self.events));
    });
  }

  cleanup(): Effect.Effect<void> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo("Cleaning up session recorder");

      if (self.intervalHandle) {
        clearInterval(self.intervalHandle);
        self.intervalHandle = null;
      }

      yield* self.closeBrowser();
      yield* self.stopServers();

      yield* Effect.logInfo("Cleanup complete");
    });
  }
}

export const runSession = <E>(
  effect: Effect.Effect<void, E>
): Promise<void> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.runPromise
  );

export const runSessionSilent = <E>(
  effect: Effect.Effect<void, E>
): Promise<void> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Error),
    Effect.runPromise
  );

export const runSessionDebug = <E>(
  effect: Effect.Effect<void, E>
): Promise<void> =>
  effect.pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Debug),
    Effect.runPromise
  );

export * from "./errors";
export * from "./types";
export * from "./server";
export * from "./playwright";
export * from "./report";
export { runLoginFlow, runNavigationFlow, runClickFlow } from "./flows/login";
export { diffSnapshots, hasLeaks, type Snapshot, type SnapshotDiff } from "../resource-monitor";
