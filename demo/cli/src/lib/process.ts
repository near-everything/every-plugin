import { resolve } from "node:path";
import { Command } from "@effect/platform";
import { Deferred, Effect, Fiber, Ref, Stream } from "effect";
import { getConfigDir, getPortsFromConfig, type SourceMode } from "../config";
import type { ProcessStatus } from "../components/dev-view";
import { loadSecretsFor } from "./secrets";

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

interface ProcessConfigBase {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  readyPatterns: RegExp[];
  errorPatterns: RegExp[];
}

const processConfigBases: Record<string, ProcessConfigBase> = {
  host: {
    name: "host",
    command: "bun",
    args: ["run", "tsx", "server.ts"],
    cwd: "host",
    readyPatterns: [/listening on/i, /server started/i, /ready/i, /running at/i],
    errorPatterns: [/error:/i, /failed/i, /exception/i],
  },
  "ui-ssr": {
    name: "ui-ssr",
    command: "bun",
    args: ["run", "rsbuild", "build", "--watch"],
    cwd: "ui",
    readyPatterns: [/built in/i, /compiled.*successfully/i],
    errorPatterns: [/error/i, /failed/i],
  },
  ui: {
    name: "ui",
    command: "bun",
    args: ["run", "rsbuild", "dev"],
    cwd: "ui",
    readyPatterns: [/ready in/i, /compiled.*successfully/i, /➜.*local:/i],
    errorPatterns: [/error/i, /failed to compile/i],
  },
  api: {
    name: "api",
    command: "bun",
    args: ["run", "rspack", "serve"],
    cwd: "api",
    readyPatterns: [/compiled.*successfully/i, /listening/i, /started/i],
    errorPatterns: [/error/i, /failed/i],
  },
};

export const getProcessConfig = (
  pkg: string,
  env?: Record<string, string>,
  portOverride?: number
): DevProcess | null => {
  const base = processConfigBases[pkg];
  if (!base) return null;

  const ports = getPortsFromConfig();
  
  let port: number;
  if (pkg === "host") {
    port = portOverride ?? ports.host;
  } else if (pkg === "ui" || pkg === "ui-ssr") {
    port = pkg === "ui-ssr" ? 0 : ports.ui;
  } else if (pkg === "api") {
    port = ports.api;
  } else {
    port = 0;
  }

  const processEnv = pkg === "ui-ssr"
    ? { ...env, BUILD_TARGET: "server" }
    : env;

  return { ...base, port, env: processEnv };
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
    const configDir = getConfigDir();
    const fullCwd = `${configDir}/${config.cwd}`;
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
        ...(config.port > 0 ? { PORT: String(config.port) } : {}),
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
        } catch { }
      },
      waitForReady: Deferred.await(readyDeferred),
      waitForExit: Effect.gen(function* () {
        yield* Fiber.joinAll([stdoutFiber, stderrFiber]);
        return yield* proc.exitCode;
      }),
    };

    return handle;
  });

interface ServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

interface BootstrapConfig {
  configPath?: string;
  secrets?: Record<string, string>;
  host?: { url?: string };
  ui?: { source?: SourceMode };
  api?: { source?: SourceMode; proxy?: string };
  database?: { url?: string };
}

const patchConsole = (
  name: string,
  callbacks: ProcessCallbacks
): (() => void) => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  const formatArgs = (args: unknown[]): string => {
    return args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(" ");
  };

  console.log = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };

  console.error = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), true);
  };

  console.warn = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };

  console.info = (...args: unknown[]) => {
    callbacks.onLog(name, formatArgs(args), false);
  };

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  };
};

export const spawnRemoteHost = (
  config: DevProcess,
  callbacks: ProcessCallbacks
) =>
  Effect.gen(function* () {
    const remoteUrl = config.env?.HOST_REMOTE_URL;

    if (!remoteUrl) {
      return yield* Effect.fail(new Error("HOST_REMOTE_URL not provided for remote host"));
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        process.env[key] = value;
      }
    }

    callbacks.onStatus(config.name, "starting");

    const configDir = getConfigDir();
    const configPath = resolve(configDir, "bos.config.json");
    const localUrl = `http://localhost:${config.port}`;

    const hostSecrets = loadSecretsFor("host");
    const apiSecrets = loadSecretsFor("api");
    const allSecrets = { ...hostSecrets, ...apiSecrets };

    const uiSource = (config.env?.UI_SOURCE as SourceMode) ?? "local";
    const apiSource = (config.env?.API_SOURCE as SourceMode) ?? "local";
    const apiProxy = config.env?.API_PROXY;

    const bootstrap: BootstrapConfig = {
      configPath,
      secrets: allSecrets,
      host: { url: localUrl },
      ui: { source: uiSource },
      api: { source: apiSource, proxy: apiProxy },
    };

    callbacks.onLog(config.name, `Remote: ${remoteUrl}`);

    const restoreConsole = patchConsole(config.name, callbacks);

    callbacks.onLog(config.name, "Loading Module Federation runtime...");

    const mfRuntime = yield* Effect.tryPromise({
      try: () => import("@module-federation/enhanced/runtime"),
      catch: (e) => new Error(`Failed to load MF runtime: ${e}`),
    });

    const mfCore = yield* Effect.tryPromise({
      try: () => import("@module-federation/runtime-core"),
      catch: (e) => new Error(`Failed to load MF core: ${e}`),
    });

    let mf = mfRuntime.getInstance();
    if (!mf) {
      mf = mfRuntime.createInstance({ name: "cli-host", remotes: [] });
      mfCore.setGlobalFederationInstance(mf);
    }

    const remoteEntryUrl = remoteUrl.endsWith("/remoteEntry.js")
      ? remoteUrl
      : `${remoteUrl}/remoteEntry.js`;

    mf.registerRemotes([{ name: "host", entry: remoteEntryUrl }]);

    callbacks.onLog(config.name, `Loading host from ${remoteEntryUrl}...`);

    const hostModule = yield* Effect.tryPromise({
      try: () => mf.loadRemote<{ runServer: (bootstrap?: BootstrapConfig) => ServerHandle }>("host/Server"),
      catch: (e) => new Error(`Failed to load host module: ${e}`),
    });

    if (!hostModule?.runServer) {
      return yield* Effect.fail(new Error("Host module does not export runServer function"));
    }

    callbacks.onLog(config.name, "Starting server...");
    const serverHandle = hostModule.runServer(bootstrap);

    yield* Effect.tryPromise({
      try: () => serverHandle.ready,
      catch: (e) => new Error(`Server failed to start: ${e}`),
    });

    callbacks.onStatus(config.name, "ready");

    const handle: ProcessHandle = {
      name: config.name,
      pid: process.pid,
      kill: async () => {
        callbacks.onLog(config.name, "Shutting down remote host...");
        restoreConsole();
        await serverHandle.shutdown();
      },
      waitForReady: Effect.void,
      waitForExit: Effect.never,
    };

    return handle;
  });

export const makeDevProcess = (
  pkg: string,
  env: Record<string, string> | undefined,
  callbacks: ProcessCallbacks,
  portOverride?: number
) =>
  Effect.gen(function* () {
    const config = getProcessConfig(pkg, env, portOverride);
    if (!config) {
      return yield* Effect.fail(new Error(`Unknown package: ${pkg}`));
    }

    if (pkg === "host" && env?.HOST_SOURCE === "remote") {
      return yield* spawnRemoteHost(config, callbacks);
    }

    return yield* spawnDevProcess(config, callbacks);
  });
