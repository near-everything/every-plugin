import { Command } from "@effect/platform";
import { Effect, Stream, Fiber, Deferred, Ref } from "effect";
import type { ProcessStatus } from "../components/dev-view";

export interface DevProcess {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  port: number;
  readyPatterns: RegExp[];
  errorPatterns: RegExp[];
}

const pkgConfigs: Record<string, Omit<DevProcess, "env">> = {
  host: {
    name: "host",
    command: "bun",
    args: ["run", "tsx", "server.ts"],
    cwd: "host",
    port: 3001,
    readyPatterns: [/listening on/i, /server started/i, /ready/i],
    errorPatterns: [/error:/i, /failed/i, /exception/i],
  },
  ui: {
    name: "ui",
    command: "bun",
    args: ["run", "rsbuild", "dev"],
    cwd: "ui",
    port: 3002,
    readyPatterns: [/ready in/i, /compiled.*successfully/i, /➜.*local:/i],
    errorPatterns: [/error/i, /failed to compile/i],
  },
  api: {
    name: "api",
    command: "bun",
    args: ["run", "rspack", "serve"],
    cwd: "api",
    port: 3014,
    readyPatterns: [/compiled.*successfully/i, /listening/i, /started/i],
    errorPatterns: [/error/i, /failed/i],
  },
};

export const getProcessConfig = (
  pkg: string,
  env?: Record<string, string>
): DevProcess | null => {
  const config = pkgConfigs[pkg];
  if (!config) return null;
  return { ...config, env };
};

export interface ProcessCallbacks {
  onStatus: (name: string, status: ProcessStatus, message?: string) => void;
  onLog: (name: string, line: string, isError?: boolean) => void;
}

export interface ProcessHandle {
  name: string;
  pid: number | undefined;
  kill: () => Promise<void>;
  waitForReady: Effect.Effect<void>;
  waitForExit: Effect.Effect<unknown, unknown>;
}

const detectStatus = (
  line: string,
  config: DevProcess
): { status: ProcessStatus; isError: boolean } | null => {
  for (const pattern of config.errorPatterns) {
    if (pattern.test(line)) {
      return { status: "error", isError: true };
    }
  }
  for (const pattern of config.readyPatterns) {
    if (pattern.test(line)) {
      return { status: "ready", isError: false };
    }
  }
  return null;
};

export const spawnDevProcess = (
  config: DevProcess,
  callbacks: ProcessCallbacks
) =>
  Effect.gen(function* () {
    const fullCwd = `${process.cwd()}/${config.cwd}`;
    const readyDeferred = yield* Deferred.make<void>();
    const statusRef = yield* Ref.make<ProcessStatus>("starting");

    callbacks.onStatus(config.name, "starting");

    const cmd = Command.make(config.command, ...config.args).pipe(
      Command.workingDirectory(fullCwd),
      Command.env({
        ...process.env,
        ...config.env,
        BOS_CONFIG_PATH: "../bos.config.json",
        FORCE_COLOR: "1",
      })
    );

    const proc = yield* Command.start(cmd);

    const handleLine = (line: string, isStderr: boolean) =>
      Effect.gen(function* () {
        if (!line.trim()) return;

        callbacks.onLog(config.name, line, isStderr);

        const currentStatus = yield* Ref.get(statusRef);
        if (currentStatus === "ready") return;

        const detected = detectStatus(line, config);
        if (detected) {
          yield* Ref.set(statusRef, detected.status);
          callbacks.onStatus(config.name, detected.status);
          if (detected.status === "ready") {
            yield* Deferred.succeed(readyDeferred, undefined);
          }
        }
      });

    const stdoutFiber = yield* Effect.fork(
      proc.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.runForEach((line) => handleLine(line, false))
      )
    );

    const stderrFiber = yield* Effect.fork(
      proc.stderr.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.runForEach((line) => handleLine(line, true))
      )
    );

    const handle: ProcessHandle = {
      name: config.name,
      pid: proc.pid,
      kill: async () => {
        proc.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 100));
        try {
          proc.kill("SIGKILL");
        } catch {}
      },
      waitForReady: Deferred.await(readyDeferred),
      waitForExit: Effect.gen(function* () {
        yield* Fiber.joinAll([stdoutFiber, stderrFiber]);
        return yield* proc.exitCode;
      }),
    };

    return handle;
  });

export const makeDevProcess = (
  pkg: string,
  env: Record<string, string> | undefined,
  callbacks: ProcessCallbacks
) =>
  Effect.gen(function* () {
    const config = getProcessConfig(pkg, env);
    if (!config) {
      return yield* Effect.fail(new Error(`Unknown package: ${pkg}`));
    }
    return yield* spawnDevProcess(config, callbacks);
  });
