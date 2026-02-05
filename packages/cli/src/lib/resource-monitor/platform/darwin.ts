import { Effect, Layer } from "effect";
import { execShellSafe } from "../command";
import type {
  MemoryInfo,
  PlatformOperations,
  PortInfo,
  ProcessInfo,
} from "../types";
import { PlatformService } from "../types";

const parseLsofLine = (
  line: string,
  ports: number[]
): { port: number; pid: number; command: string } | null => {
  const parts = line.split(/\s+/);
  if (parts.length < 9) return null;

  const command = parts[0];
  const pid = parseInt(parts[1], 10);
  const nameCol = parts[8] || parts[7];

  const portMatch = nameCol.match(/:(\d+)$/);
  if (!portMatch) return null;

  const port = parseInt(portMatch[1], 10);
  if (!ports.includes(port)) return null;

  return { port, pid, command };
};

const getPortInfo = (
  ports: number[]
): Effect.Effect<Record<number, PortInfo>, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[darwin] Checking ${ports.length} ports`);

    const result: Record<number, PortInfo> = {};
    for (const port of ports) {
      result[port] = { port, pid: null, command: null, state: "FREE" };
    }

    if (ports.length === 0) return result;

    const output = yield* execShellSafe(
      "lsof -i -P -n -sTCP:LISTEN 2>/dev/null || true"
    );
    if (!output) {
      yield* Effect.logDebug("[darwin] No lsof output, all ports appear free");
      return result;
    }

    const lines = output.split("\n").filter(Boolean);
    yield* Effect.logDebug(`[darwin] Parsing ${lines.length} lsof lines`);

    for (const line of lines.slice(1)) {
      const parsed = parseLsofLine(line, ports);
      if (parsed) {
        result[parsed.port] = {
          port: parsed.port,
          pid: parsed.pid,
          command: parsed.command,
          state: "LISTEN",
        };
        yield* Effect.logDebug(
          `[darwin] Port :${parsed.port} bound to PID ${parsed.pid} (${parsed.command})`
        );
      }
    }

    const boundCount = Object.values(result).filter(
      (p) => p.state === "LISTEN"
    ).length;
    yield* Effect.logInfo(
      `[darwin] Found ${boundCount}/${ports.length} ports in use`
    );

    return result;
  });

const getProcessTree = (
  rootPids: number[]
): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `[darwin] Building process tree for ${rootPids.length} root PIDs`
    );

    const processes: ProcessInfo[] = [];
    const visited = new Set<number>();

    const getProcess = (
      pid: number
    ): Effect.Effect<ProcessInfo | null, never> =>
      Effect.gen(function* () {
        if (visited.has(pid)) return null;
        visited.add(pid);

        const output = yield* execShellSafe(
          `ps -p ${pid} -o pid=,ppid=,rss=,comm=,args= 2>/dev/null || true`
        );
        if (!output) return null;

        const parts = output.trim().split(/\s+/);
        if (parts.length < 4) return null;

        const [pidStr, ppidStr, rssStr, ...rest] = parts;
        const command = rest[0] || "";
        const args = rest.slice(1);

        yield* Effect.logDebug(
          `[darwin] Process ${pid}: ${command} (RSS: ${rssStr}KB)`
        );

        return {
          pid: parseInt(pidStr, 10),
          ppid: parseInt(ppidStr, 10),
          command,
          args,
          rss: parseInt(rssStr, 10) * 1024,
          children: [],
        };
      });

    const getChildren = (pid: number): Effect.Effect<number[], never> =>
      Effect.gen(function* () {
        const output = yield* execShellSafe(
          `pgrep -P ${pid} 2>/dev/null || true`
        );
        if (!output) return [];

        const children = output
          .split("\n")
          .filter(Boolean)
          .map((s) => parseInt(s, 10))
          .filter((n) => !isNaN(n));

        if (children.length > 0) {
          yield* Effect.logDebug(
            `[darwin] PID ${pid} has ${children.length} children: ${children.join(", ")}`
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
      `[darwin] Process tree contains ${processes.length} processes`
    );

    return processes;
  });

const getMemoryInfo = (): Effect.Effect<MemoryInfo, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[darwin] Getting memory info");

    const sysctlMem = yield* execShellSafe(
      "sysctl -n hw.memsize 2>/dev/null || echo 0"
    );
    const total = parseInt(sysctlMem, 10) || 16 * 1024 * 1024 * 1024;

    const pageSizeOutput = yield* execShellSafe(
      "sysctl -n hw.pagesize 2>/dev/null || echo 16384"
    );
    const pageSize = parseInt(pageSizeOutput.trim(), 10) || 16384;

    const vmStat = yield* execShellSafe("vm_stat 2>/dev/null || true");

    let freePages = 0;
    let activePages = 0;
    let inactivePages = 0;
    let wiredPages = 0;
    let speculativePages = 0;

    for (const line of vmStat.split("\n")) {
      const match = line.match(/^(.+?):\s+(\d+)/);
      if (!match) continue;

      const [, key, value] = match;
      const pages = parseInt(value, 10);

      if (key.includes("Pages free")) freePages = pages;
      else if (key.includes("Pages active")) activePages = pages;
      else if (key.includes("Pages inactive")) inactivePages = pages;
      else if (key.includes("Pages wired")) wiredPages = pages;
      else if (key.includes("Pages speculative")) speculativePages = pages;
    }

    const free = freePages * pageSize;
    const active = activePages * pageSize;
    const inactive = inactivePages * pageSize;
    const wired = wiredPages * pageSize;
    const speculative = speculativePages * pageSize;

    const used = active + inactive + wired + speculative;

    const effectiveFree = free > 0 ? free : Math.max(0, total - used);

    const totalMB = (total / 1024 / 1024).toFixed(0);
    const usedMB = (used / 1024 / 1024).toFixed(0);
    const freeMB = (effectiveFree / 1024 / 1024).toFixed(0);
    yield* Effect.logDebug(
      `[darwin] Memory: ${usedMB}MB used / ${freeMB}MB free / ${totalMB}MB total`
    );

    return {
      total,
      used,
      free: effectiveFree,
      processRss: 0,
    };
  });

const getAllProcesses = (): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[darwin] Getting all processes");

    const processes: ProcessInfo[] = [];

    const output = yield* execShellSafe(
      "ps -axo pid=,ppid=,rss=,comm= 2>/dev/null || true"
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

    yield* Effect.logDebug(`[darwin] Found ${processes.length} total processes`);

    return processes;
  });

const findChildProcesses = (pid: number): Effect.Effect<number[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`[darwin] Finding all children of PID ${pid}`);

    const children: number[] = [];
    const visited = new Set<number>();

    const recurse = (parentPid: number): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        if (visited.has(parentPid)) return;
        visited.add(parentPid);

        const output = yield* execShellSafe(
          `pgrep -P ${parentPid} 2>/dev/null || true`
        );
        if (!output) return;

        for (const line of output.split("\n").filter(Boolean)) {
          const childPid = parseInt(line, 10);
          if (!isNaN(childPid)) {
            children.push(childPid);
            yield* recurse(childPid);
          }
        }
      });

    yield* recurse(pid);

    if (children.length > 0) {
      yield* Effect.logDebug(
        `[darwin] PID ${pid} has ${children.length} descendants`
      );
    }

    return children;
  });

const darwinOperations: PlatformOperations = {
  getPortInfo,
  getProcessTree,
  getMemoryInfo,
  getAllProcesses,
  findChildProcesses,
};

export const DarwinLayer = Layer.succeed(PlatformService, darwinOperations);
