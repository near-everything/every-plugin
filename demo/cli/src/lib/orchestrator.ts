import { appendFile } from "node:fs/promises";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import path from "path";
import type { DevConfig } from "../config";
import {
  type DevViewHandle,
  type LogEntry,
  type ProcessState,
  renderDevView,
} from "../components/dev-view";
import { getProcessConfig, makeDevProcess, type ProcessCallbacks, type ProcessHandle } from "./process";

export interface DevOrchestrator {
  packages: string[];
  env: Record<string, string>;
  description: string;
  devConfig: DevConfig;
}

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

export const runDevServers = (orchestrator: DevOrchestrator) =>
  Effect.gen(function* () {
    const orderedPackages = sortByOrder(orchestrator.packages);

    const initialProcesses: ProcessState[] = orderedPackages.map((pkg) => {
      const config = getProcessConfig(pkg);
      return {
        name: pkg,
        status: "pending" as const,
        port: config?.port ?? 0,
      };
    });

    const handles: ProcessHandle[] = [];
    const allLogs: LogEntry[] = [];
    let logFile: string | null = null;
    let view: DevViewHandle | null = null;
    let shuttingDown = false;

    yield* Effect.promise(async () => {
      await ensureLogDir();
      logFile = getLogFile();
      await Bun.write(logFile, `# BOS Dev Session: ${orchestrator.description}\n# Started: ${new Date().toISOString()}\n\n`);
    });

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

    view = renderDevView(
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
        view?.addLog(name, line, isError);

        if (logFile) {
          const logLine = formatLogLine(entry) + "\n";
          appendFile(logFile, logLine).catch(() => { });
        }
      },
    };

    for (const pkg of orderedPackages) {
      const handle = yield* makeDevProcess(pkg, orchestrator.env, callbacks);
      handles.push(handle);

      if (pkg !== orderedPackages[orderedPackages.length - 1]) {
        yield* Effect.race(
          handle.waitForReady,
          Effect.sleep("30 seconds").pipe(
            Effect.andThen(Effect.sync(() => {
              callbacks.onLog(pkg, "Timeout waiting for ready, continuing...", true);
            }))
          )
        );
      }
    }

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => cleanup(false))
    );

    yield* Effect.never;
  });

export const startDev = (orchestrator: DevOrchestrator) => {
  const program = Effect.scoped(runDevServers(orchestrator)).pipe(
    Effect.provide(BunContext.layer),
    Effect.catchAll((e) => Effect.sync(() => {
      console.error("Dev server error:", e);
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
