import { appendFile } from "node:fs/promises";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "every-plugin/effect";
import path from "path";
import type { AppConfig } from "../config";
import {
  type DevViewHandle,
  type LogEntry,
  type ProcessState,
  renderDevView,
} from "../components/dev-view";
import { renderStreamingView, type StreamingViewHandle } from "../components/streaming-view";
import { getProcessConfig, makeDevProcess, type ProcessCallbacks, type ProcessHandle } from "./process";

const LOG_NOISE_PATTERNS = [
  /\[ Federation Runtime \] Version .* from host of shared singleton module/,
  /Executing an Effect versioned \d+\.\d+\.\d+ with a Runtime of version/,
  /you may want to dedupe the effect dependencies/,
];

const isDebugMode = (): boolean => {
  return process.env.DEBUG === "true" || process.env.DEBUG === "1";
};

const shouldDisplayLog = (line: string): boolean => {
  if (isDebugMode()) return true;
  return !LOG_NOISE_PATTERNS.some(pattern => pattern.test(line));
};

export interface AppOrchestrator {
  packages: string[];
  env: Record<string, string>;
  description: string;
  appConfig: AppConfig;
  port?: number;
  interactive?: boolean;
  noLogs?: boolean;
}

const isInteractiveSupported = (): boolean => {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
};

const STARTUP_ORDER = ["ui-ssr", "ui", "api", "host"];

const sortByOrder = (packages: string[]): string[] => {
  return [...packages].sort((a, b) => {
    const aIdx = STARTUP_ORDER.indexOf(a);
    const bIdx = STARTUP_ORDER.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
};

const getLogDir = () => path.join(process.cwd(), ".bos", "logs");
const getLogFile = () => {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(getLogDir(), `dev-${ts}.log`);
};

const ensureLogDir = async () => {
  const dir = getLogDir();
  await Bun.spawn(["mkdir", "-p", dir]).exited;
};

const formatLogLine = (entry: LogEntry): string => {
  const ts = new Date(entry.timestamp).toISOString();
  const prefix = entry.isError ? "ERR" : "OUT";
  return `[${ts}] [${entry.source}] [${prefix}] ${entry.line}`;
};

export const runDevServers = (orchestrator: AppOrchestrator) =>
  Effect.gen(function* () {
    const orderedPackages = sortByOrder(orchestrator.packages);

    const initialProcesses: ProcessState[] = orderedPackages.map((pkg) => {
      const portOverride = pkg === "host" ? orchestrator.port : undefined;
      const config = getProcessConfig(pkg, undefined, portOverride);
      const source = pkg === "host" 
        ? orchestrator.appConfig.host 
        : pkg === "ui" || pkg === "ui-ssr"
          ? orchestrator.appConfig.ui
          : pkg === "api" 
            ? orchestrator.appConfig.api 
            : undefined;
      return {
        name: pkg,
        status: "pending" as const,
        port: config?.port ?? 0,
        source,
      };
    });

    const handles: ProcessHandle[] = [];
    const allLogs: LogEntry[] = [];
    let logFile: string | null = null;
    let view: DevViewHandle | null = null;
    let shuttingDown = false;

    if (!orchestrator.noLogs) {
      yield* Effect.promise(async () => {
        await ensureLogDir();
        logFile = getLogFile();
        await Bun.write(logFile, `# BOS Dev Session: ${orchestrator.description}\n# Started: ${new Date().toISOString()}\n\n`);
      });
    }

    const killAll = async () => {
      const reversed = [...handles].reverse();
      for (const handle of reversed) {
        try {
          await handle.kill();
        } catch { }
      }
    };

    const exportLogs = async () => {
      console.log("\n\n--- SESSION LOGS ---\n");
      for (const entry of allLogs) {
        console.log(formatLogLine(entry));
      }
      console.log("\n--- END LOGS ---\n");
      if (logFile) {
        console.log(`Full logs saved to: ${logFile}\n`);
      }
    };

    const cleanup = async (showLogs = false) => {
      if (shuttingDown) return;
      shuttingDown = true;
      view?.unmount();
      await killAll();
      if (showLogs) {
        await exportLogs();
      }
    };

    const useInteractive = orchestrator.interactive ?? isInteractiveSupported();
    
    view = useInteractive
      ? renderDevView(
          initialProcesses,
          orchestrator.description,
          orchestrator.env,
          () => cleanup(false),
          () => cleanup(true)
        )
      : renderStreamingView(
          initialProcesses,
          orchestrator.description,
          orchestrator.env,
          () => cleanup(false),
          () => cleanup(true)
        );

    const callbacks: ProcessCallbacks = {
      onStatus: (name, status, message) => {
        view?.updateProcess(name, status, message);
      },
      onLog: (name, line, isError) => {
        const entry: LogEntry = {
          source: name,
          line,
          timestamp: Date.now(),
          isError,
        };
        allLogs.push(entry);

        if (shouldDisplayLog(line)) {
          view?.addLog(name, line, isError);
        }

        if (logFile) {
          const logLine = formatLogLine(entry) + "\n";
          appendFile(logFile, logLine).catch(() => { });
        }
      },
    };

    for (const pkg of orderedPackages) {
      const portOverride = pkg === "host" ? orchestrator.port : undefined;
      const handle = yield* makeDevProcess(pkg, orchestrator.env, callbacks, portOverride);
      handles.push(handle);

      yield* Effect.race(
        handle.waitForReady,
        Effect.sleep("30 seconds").pipe(
          Effect.andThen(Effect.sync(() => {
            callbacks.onLog(pkg, "Timeout waiting for ready, continuing...", true);
          }))
        )
      );
    }

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => cleanup(false))
    );

    yield* Effect.never;
  });

export const startApp = (orchestrator: AppOrchestrator) => {
  const program = Effect.scoped(runDevServers(orchestrator)).pipe(
    Effect.provide(BunContext.layer),
    Effect.catchAll((e) => Effect.sync(() => {
      if (e instanceof Error) {
        console.error("App server error:", e.message);
        if (e.stack) {
          console.error(e.stack);
        }
      } else if (typeof e === 'object' && e !== null) {
        console.error("App server error:", JSON.stringify(e, null, 2));
      } else {
        console.error("App server error:", e);
      }
    }))
  );

  process.on("SIGINT", () => {
    setTimeout(() => process.exit(0), 500);
  });

  process.on("SIGTERM", () => {
    setTimeout(() => process.exit(0), 500);
  });

  BunRuntime.runMain(program);
};
