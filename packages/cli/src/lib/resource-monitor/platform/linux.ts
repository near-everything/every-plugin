import { Effect, Layer } from "effect";
import { readFile } from "node:fs/promises";
import { execShellSafe } from "../command";
import type {
  MemoryInfo,
  PlatformOperations,
  PortInfo,
  ProcessInfo,
} from "../types";
import { PlatformService } from "../types";

const readFileSafe = (path: string): Effect.Effect<string | null, never> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf-8"),
    catch: () => new Error("file not found"),
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

const getPortInfo = (
  ports: number[]
): Effect.Effect<Record<number, PortInfo>, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[linux] Checking ${ports.length} ports`);

    const result: Record<number, PortInfo> = {};
    for (const port of ports) {
      result[port] = { port, pid: null, command: null, state: "FREE" };
    }

    if (ports.length === 0) return result;

    const output = yield* execShellSafe(
      "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true"
    );
    if (!output) {
      yield* Effect.logDebug("[linux] No ss/netstat output, all ports appear free");
      return result;
    }

    const lines = output.split("\n").filter(Boolean);
    yield* Effect.logDebug(`[linux] Parsing ${lines.length} ss/netstat lines`);

    for (const line of lines) {
      const portMatch = line.match(/:(\d+)\s/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (!ports.includes(port)) continue;

      const pidMatch = line.match(/pid=(\d+)/);
      const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;

      let command: string | null = null;
      if (pid) {
        const commContent = yield* readFileSafe(`/proc/${pid}/comm`);
        command = commContent?.trim() ?? null;
      }

      result[port] = {
        port,
        pid,
        command,
        state: "LISTEN",
      };

      yield* Effect.logDebug(
        `[linux] Port :${port} bound to PID ${pid} (${command})`
      );
    }

    const boundCount = Object.values(result).filter(
      (p) => p.state === "LISTEN"
    ).length;
    yield* Effect.logInfo(
      `[linux] Found ${boundCount}/${ports.length} ports in use`
    );

    return result;
  });

const getProcessTree = (
  rootPids: number[]
): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `[linux] Building process tree for ${rootPids.length} root PIDs`
    );

    const processes: ProcessInfo[] = [];
    const visited = new Set<number>();

    const getProcess = (
      pid: number
    ): Effect.Effect<ProcessInfo | null, never> =>
      Effect.gen(function* () {
        if (visited.has(pid)) return null;
        visited.add(pid);

        const stat = yield* readFileSafe(`/proc/${pid}/stat`);
        const status = yield* readFileSafe(`/proc/${pid}/status`);
        const cmdline = yield* readFileSafe(`/proc/${pid}/cmdline`);

        if (!stat || !status) return null;

        const statParts = stat.split(" ");
        const ppid = parseInt(statParts[3], 10);

        let rss = 0;
        for (const line of status.split("\n")) {
          if (line.startsWith("VmRSS:")) {
            const match = line.match(/(\d+)/);
            if (match) rss = parseInt(match[1], 10) * 1024;
            break;
          }
        }

        const args = cmdline?.split("\0").filter(Boolean) ?? [];
        const command = args[0] || statParts[1].replace(/[()]/g, "");

        yield* Effect.logDebug(
          `[linux] Process ${pid}: ${command} (RSS: ${(rss / 1024).toFixed(0)}KB)`
        );

        return {
          pid,
          ppid,
          command,
          args: args.slice(1),
          rss,
          children: [],
        };
      });

    const getChildren = (pid: number): Effect.Effect<number[], never> =>
      Effect.gen(function* () {
        const childrenFile = yield* readFileSafe(
          `/proc/${pid}/task/${pid}/children`
        );

        if (childrenFile) {
          const children = childrenFile
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => parseInt(s, 10));

          if (children.length > 0) {
            yield* Effect.logDebug(
              `[linux] PID ${pid} has ${children.length} children: ${children.join(", ")}`
            );
          }

          return children;
        }

        const output = yield* execShellSafe(
          `pgrep -P ${pid} 2>/dev/null || true`
        );
        if (!output) return [];

        const children = output
          .split("\n")
          .filter(Boolean)
          .map((s) => parseInt(s, 10));

        if (children.length > 0) {
          yield* Effect.logDebug(
            `[linux] PID ${pid} has ${children.length} children (via pgrep)`
          );
        }

        return children;
      });

    const traverse = (pid: number): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const proc = yield* getProcess(pid);
        if (!proc) return;

        const children = yield* getChildren(pid);
        proc.children = children;
        processes.push(proc);

        for (const child of children) {
          yield* traverse(child);
        }
      });

    for (const pid of rootPids) {
      yield* traverse(pid);
    }

    yield* Effect.logInfo(
      `[linux] Process tree contains ${processes.length} processes`
    );

    return processes;
  });

const getMemoryInfo = (): Effect.Effect<MemoryInfo, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[linux] Getting memory info");

    const meminfo = yield* readFileSafe("/proc/meminfo");

    if (!meminfo) {
      yield* Effect.logWarning("[linux] Could not read /proc/meminfo");
      return { total: 0, used: 0, free: 0, processRss: 0 };
    }

    let total = 0;
    let free = 0;
    let available = 0;

    for (const line of meminfo.split("\n")) {
      const [key, value] = line.split(":");
      if (!value) continue;

      const kb = parseInt(value.trim().split(/\s+/)[0], 10) * 1024;

      if (key === "MemTotal") total = kb;
      else if (key === "MemFree") free = kb;
      else if (key === "MemAvailable") available = kb;
    }

    const totalMB = (total / 1024 / 1024).toFixed(0);
    const usedMB = ((total - (available || free)) / 1024 / 1024).toFixed(0);
    yield* Effect.logDebug(
      `[linux] Memory: ${usedMB}MB used / ${totalMB}MB total`
    );

    return {
      total,
      used: total - (available || free),
      free: available || free,
      processRss: 0,
    };
  });

const getAllProcesses = (): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[linux] Getting all processes");

    const processes: ProcessInfo[] = [];

    const output = yield* execShellSafe(
      "ps -eo pid=,ppid=,rss=,comm= 2>/dev/null || true"
    );
    for (const line of output.split("\n").filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const [pidStr, ppidStr, rssStr, ...rest] = parts;
      processes.push({
        pid: parseInt(pidStr, 10),
        ppid: parseInt(ppidStr, 10),
        command: rest.join(" "),
        args: [],
        rss: parseInt(rssStr, 10) * 1024,
        children: [],
      });
    }

    yield* Effect.logDebug(`[linux] Found ${processes.length} total processes`);

    return processes;
  });

const findChildProcesses = (pid: number): Effect.Effect<number[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`[linux] Finding all children of PID ${pid}`);

    const children: number[] = [];
    const visited = new Set<number>();

    const recurse = (parentPid: number): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        if (visited.has(parentPid)) return;
        visited.add(parentPid);

        const childrenFile = yield* readFileSafe(
          `/proc/${parentPid}/task/${parentPid}/children`
        );

        let childPids: number[] = [];
        if (childrenFile) {
          childPids = childrenFile
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => parseInt(s, 10));
        } else {
          const output = yield* execShellSafe(
            `pgrep -P ${parentPid} 2>/dev/null || true`
          );
          if (output) {
            childPids = output
              .split("\n")
              .filter(Boolean)
              .map((s) => parseInt(s, 10));
          }
        }

        for (const childPid of childPids) {
          if (!isNaN(childPid)) {
            children.push(childPid);
            yield* recurse(childPid);
          }
        }
      });

    yield* recurse(pid);

    if (children.length > 0) {
      yield* Effect.logDebug(
        `[linux] PID ${pid} has ${children.length} descendants`
      );
    }

    return children;
  });

const linuxOperations: PlatformOperations = {
  getPortInfo,
  getProcessTree,
  getMemoryInfo,
  getAllProcesses,
  findChildProcesses,
};

export const LinuxLayer = Layer.succeed(PlatformService, linuxOperations);
