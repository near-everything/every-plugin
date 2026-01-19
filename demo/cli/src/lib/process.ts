import { resolve } from "node:path";
import { Command } from "@effect/platform";
import { Deferred, Effect, Fiber, Ref, Stream } from "effect";
import type { SourceMode } from "../config";
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

const pkgConfigs: Record<string, Omit<DevProcess, "env">> = {
  host: {
    name: "host",
    command: "bun",
    args: ["run", "tsx", "server.ts"],
    cwd: "host",
    port: 3001,
    readyPatterns: [/listening on/i, /server started/i, /ready/i, /running at/i],
    errorPatterns: [/error:/i, /failed/i, /exception/i],
  },
  "ui-ssr": {
    name: "ui-ssr",
    command: "bun",
    args: ["run", "rsbuild", "build", "--watch"],
    cwd: "ui",
    port: 0,
    readyPatterns: [/built in/i, /compiled.*successfully/i],
    errorPatterns: [/error/i, /failed/i],
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

  const processEnv = pkg === "ui-ssr"
    ? { ...env, BUILD_TARGET: "server" }
    : env;

  return { ...config, env: processEnv };
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
  ui?: { source?: SourceMode };
  api?: { source?: SourceMode; proxy?: string };
  database?: { url?: string };
}

export const spawnRemoteHost = (
  config: DevProcess,
  callbacks: ProcessCallbacks
) =>
  Effect.gen(function* () {
    const readyDeferred = yield* Deferred.make<void>();
    const remoteUrl = config.env?.HOST_REMOTE_URL;

    if (!remoteUrl) {
      return yield* Effect.fail(new Error("HOST_REMOTE_URL not provided for remote host"));
    }

    callbacks.onStatus(config.name, "starting");
    callbacks.onLog(config.name, `Loading host from remote: ${remoteUrl}`);

    const configPath = resolve(process.cwd(), "bos.config.json");
    
    const hostSecrets = loadSecretsFor("host");
    callbacks.onLog(config.name, `Loaded ${Object.keys(hostSecrets).length} host secrets`);

    const uiSource = (config.env?.UI_SOURCE as SourceMode) ?? "local";
    const apiSource = (config.env?.API_SOURCE as SourceMode) ?? "local";
    const apiProxy = config.env?.API_PROXY;

    const bootstrap: BootstrapConfig = {
      configPath,
      secrets: hostSecrets,
      ui: { source: uiSource },
      api: { source: apiSource, proxy: apiProxy },
    };

    callbacks.onLog(config.name, `Bootstrap config: UI=${uiSource}, API=${apiSource}`);

    let serverHandle: ServerHandle | null = null;

    const loadAndRun = async () => {
      try {
        const { createInstance, getInstance } = await import("@module-federation/enhanced/runtime");
        const { setGlobalFederationInstance } = await import("@module-federation/runtime-core");

        let mf = getInstance();
        if (!mf) {
          mf = createInstance({
            name: "cli-host",
            remotes: [],
          });
          setGlobalFederationInstance(mf);
        }

        const remoteEntryUrl = remoteUrl.endsWith("/remoteEntry.js")
          ? remoteUrl
          : `${remoteUrl}/remoteEntry.js`;

        callbacks.onLog(config.name, `Registering host remote: ${remoteEntryUrl}`);
        mf.registerRemotes([{
          name: "host",
          entry: remoteEntryUrl,
        }]);

        callbacks.onLog(config.name, "Loading host/Server module...");
        const hostModule = await mf.loadRemote<{ runServer: (bootstrap?: BootstrapConfig) => ServerHandle }>("host/Server");

        if (!hostModule?.runServer) {
          throw new Error("Host module does not export runServer function");
        }

        callbacks.onLog(config.name, "Starting remote host server with bootstrap config...");
        serverHandle = hostModule.runServer(bootstrap);

        await serverHandle.ready;

        callbacks.onStatus(config.name, "ready");
        callbacks.onLog(config.name, `Remote host ready at http://localhost:${config.port}`);
        Deferred.unsafeDone(readyDeferred, Effect.void);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
        callbacks.onLog(config.name, `Error: ${errorMsg}`, true);
        callbacks.onStatus(config.name, "error");
        Deferred.unsafeDone(readyDeferred, Effect.void);
        throw error;
      }
    };

    const serverPromise = loadAndRun();

    const handle: ProcessHandle = {
      name: config.name,
      pid: process.pid,
      kill: async () => {
        callbacks.onLog(config.name, "Shutting down remote host...");
        if (serverHandle) {
          await serverHandle.shutdown();
        }
      },
      waitForReady: Deferred.await(readyDeferred),
      waitForExit: Effect.promise(() => serverPromise),
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

    if (pkg === "host" && env?.HOST_SOURCE === "remote") {
      return yield* spawnRemoteHost(config, callbacks);
    }

    return yield* spawnDevProcess(config, callbacks);
  });
