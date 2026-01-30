import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer, Ref } from "every-plugin/effect";
import { getConfigDir } from "../config";

const getPidFilePath = () => join(getConfigDir(), ".bos", "pids.json");

export interface TrackedProcess {
  pid: number;
  name: string;
  port: number;
  startedAt: number;
  command: string;
}

export interface ProcessRegistry {
  readonly tracked: Ref.Ref<Map<number, TrackedProcess>>;
  track: (proc: TrackedProcess) => Effect.Effect<void>;
  untrack: (pid: number) => Effect.Effect<void>;
  getAll: () => Effect.Effect<TrackedProcess[]>;
  killAll: (force?: boolean) => Effect.Effect<{ killed: number[]; failed: number[] }>;
  persist: () => Effect.Effect<void>;
  restore: () => Effect.Effect<void>;
}

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killProcess = (pid: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
};

const make = Effect.gen(function* () {
  const tracked = yield* Ref.make(new Map<number, TrackedProcess>());
  const pidFile = getPidFilePath();

  const track: ProcessRegistry["track"] = (proc) =>
    Effect.gen(function* () {
      yield* Ref.update(tracked, (m) => new Map(m).set(proc.pid, proc));
      yield* persist();
    });

  const untrack: ProcessRegistry["untrack"] = (pid) =>
    Effect.gen(function* () {
      yield* Ref.update(tracked, (m) => {
        const copy = new Map(m);
        copy.delete(pid);
        return copy;
      });
      yield* persist();
    });

  const getAll: ProcessRegistry["getAll"] = () =>
    Ref.get(tracked).pipe(Effect.map((m) => Array.from(m.values())));

  const killAll: ProcessRegistry["killAll"] = (force = false) =>
    Effect.gen(function* () {
      const procs = yield* getAll();
      const killed: number[] = [];
      const failed: number[] = [];

      for (const proc of procs) {
        if (!isProcessAlive(proc.pid)) {
          yield* untrack(proc.pid);
          continue;
        }

        const signal = force ? "SIGKILL" : "SIGTERM";
        if (killProcess(proc.pid, signal)) {
          killed.push(proc.pid);
          yield* untrack(proc.pid);
        } else {
          failed.push(proc.pid);
        }
      }

      if (!force && failed.length > 0) {
        yield* Effect.sleep("500 millis");
        for (const pid of [...failed]) {
          if (killProcess(pid, "SIGKILL")) {
            const idx = failed.indexOf(pid);
            if (idx !== -1) {
              failed.splice(idx, 1);
              killed.push(pid);
            }
            yield* untrack(pid);
          }
        }
      }

      yield* persist();
      return { killed, failed };
    });

  const persist: ProcessRegistry["persist"] = () =>
    Effect.gen(function* () {
      const procs = yield* getAll();
      const dir = dirname(pidFile);
      
      yield* Effect.tryPromise({
        try: async () => {
          if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
          }
          await writeFile(pidFile, JSON.stringify(procs, null, 2));
        },
        catch: () => new Error("Failed to persist PIDs"),
      }).pipe(Effect.catchAll(() => Effect.void));
    });

  const restore: ProcessRegistry["restore"] = () =>
    Effect.gen(function* () {
      if (!existsSync(pidFile)) return;

      const content = yield* Effect.tryPromise({
        try: () => readFile(pidFile, "utf8"),
        catch: () => new Error("Failed to read PID file"),
      }).pipe(Effect.catchAll(() => Effect.succeed("")));

      if (!content) return;

      let procs: TrackedProcess[];
      try {
        procs = JSON.parse(content) as TrackedProcess[];
      } catch {
        return;
      }

      const alive = procs.filter((p) => isProcessAlive(p.pid));
      yield* Ref.set(tracked, new Map(alive.map((p) => [p.pid, p])));
    });

  yield* restore();

  return { tracked, track, untrack, getAll, killAll, persist, restore };
});

export class ProcessRegistryService extends Context.Tag("bos/ProcessRegistry")<
  ProcessRegistryService,
  ProcessRegistry
>() {
  static Live = Layer.effect(ProcessRegistryService, make);
}

export const createProcessRegistry = (): Effect.Effect<ProcessRegistry> => make;
