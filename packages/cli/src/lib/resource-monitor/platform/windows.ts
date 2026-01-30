import { Effect, Layer } from "effect";
import { execShellSafe, powershellSafe } from "../command";
import type {
  MemoryInfo,
  PlatformOperations,
  PortInfo,
  ProcessInfo,
} from "../types";
import { PlatformService } from "../types";

const getPortInfo = (
  ports: number[]
): Effect.Effect<Record<number, PortInfo>, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`[windows] Checking ${ports.length} ports`);

    const result: Record<number, PortInfo> = {};
    for (const port of ports) {
      result[port] = { port, pid: null, command: null, state: "FREE" };
    }

    if (ports.length === 0) return result;

    const output = yield* execShellSafe("netstat -ano -p TCP");
    if (!output) {
      yield* Effect.logDebug(
        "[windows] No netstat output, all ports appear free"
      );
      return result;
    }

    const lines = output.split("\n").filter(Boolean);
    yield* Effect.logDebug(`[windows] Parsing ${lines.length} netstat lines`);

    for (const line of lines) {
      if (!line.includes("LISTENING")) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;

      const localAddr = parts[1];
      const portMatch = localAddr.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (!ports.includes(port)) continue;

      const pid = parseInt(parts[4], 10);

      let command: string | null = null;
      if (pid) {
        const cmdOutput = yield* execShellSafe(
          `wmic process where ProcessId=${pid} get Name /format:list`
        );
        const nameMatch = cmdOutput.match(/Name=(.+)/);
        command = nameMatch ? nameMatch[1].trim() : null;
      }

      result[port] = {
        port,
        pid,
        command,
        state: "LISTEN",
      };

      yield* Effect.logDebug(
        `[windows] Port :${port} bound to PID ${pid} (${command})`
      );
    }

    const boundCount = Object.values(result).filter(
      (p) => p.state === "LISTEN"
    ).length;
    yield* Effect.logInfo(
      `[windows] Found ${boundCount}/${ports.length} ports in use`
    );

    return result;
  });

const getProcessTree = (
  rootPids: number[]
): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `[windows] Building process tree for ${rootPids.length} root PIDs`
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
          `wmic process where ProcessId=${pid} get ProcessId,ParentProcessId,WorkingSetSize,Name,CommandLine /format:csv`
        );
        const lines = output
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("Node"));
        if (lines.length === 0) return null;

        const parts = lines[0].split(",");
        if (parts.length < 5) return null;

        const cmdLine = parts[1] || "";
        const name = parts[2] || "";
        const ppid = parseInt(parts[3], 10);
        const procId = parseInt(parts[4], 10);
        const rss = parseInt(parts[5], 10) || 0;

        yield* Effect.logDebug(
          `[windows] Process ${pid}: ${name} (RSS: ${(rss / 1024).toFixed(0)}KB)`
        );

        return {
          pid: procId,
          ppid,
          command: name,
          args: cmdLine.split(/\s+/).slice(1),
          rss,
          children: [],
        };
      });

    const getChildren = (pid: number): Effect.Effect<number[], never> =>
      Effect.gen(function* () {
        const output = yield* execShellSafe(
          `wmic process where ParentProcessId=${pid} get ProcessId /format:list`
        );
        const matches = output.match(/ProcessId=(\d+)/g);
        if (!matches) return [];

        const children = matches.map((m) =>
          parseInt(m.replace("ProcessId=", ""), 10)
        );

        if (children.length > 0) {
          yield* Effect.logDebug(
            `[windows] PID ${pid} has ${children.length} children: ${children.join(", ")}`
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
      `[windows] Process tree contains ${processes.length} processes`
    );

    return processes;
  });

const getMemoryInfo = (): Effect.Effect<MemoryInfo, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[windows] Getting memory info");

    const script = `
      $os = Get-CimInstance Win32_OperatingSystem
      $total = $os.TotalVisibleMemorySize * 1024
      $free = $os.FreePhysicalMemory * 1024
      Write-Output "$total,$free"
    `;
    const output = yield* powershellSafe(script);

    if (!output) {
      yield* Effect.logWarning("[windows] Could not get memory info");
      return { total: 0, used: 0, free: 0, processRss: 0 };
    }

    const [totalStr, freeStr] = output.split(",");
    const total = parseInt(totalStr, 10) || 0;
    const free = parseInt(freeStr, 10) || 0;

    const totalMB = (total / 1024 / 1024).toFixed(0);
    const usedMB = ((total - free) / 1024 / 1024).toFixed(0);
    yield* Effect.logDebug(
      `[windows] Memory: ${usedMB}MB used / ${totalMB}MB total`
    );

    return {
      total,
      used: total - free,
      free,
      processRss: 0,
    };
  });

const getAllProcesses = (): Effect.Effect<ProcessInfo[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("[windows] Getting all processes");

    const processes: ProcessInfo[] = [];

    const output = yield* execShellSafe(
      "wmic process get ProcessId,ParentProcessId,WorkingSetSize,Name /format:csv"
    );
    const lines = output
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("Node"));

    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 4) continue;

      const name = parts[1] || "";
      const ppid = parseInt(parts[2], 10);
      const pid = parseInt(parts[3], 10);
      const rss = parseInt(parts[4], 10) || 0;

      if (isNaN(pid)) continue;

      processes.push({
        pid,
        ppid: isNaN(ppid) ? 0 : ppid,
        command: name,
        args: [],
        rss,
        children: [],
      });
    }

    yield* Effect.logDebug(
      `[windows] Found ${processes.length} total processes`
    );

    return processes;
  });

const findChildProcesses = (pid: number): Effect.Effect<number[], never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`[windows] Finding all children of PID ${pid}`);

    const children: number[] = [];
    const visited = new Set<number>();

    const recurse = (parentPid: number): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        if (visited.has(parentPid)) return;
        visited.add(parentPid);

        const output = yield* execShellSafe(
          `wmic process where ParentProcessId=${parentPid} get ProcessId /format:list`
        );
        const matches = output.match(/ProcessId=(\d+)/g);
        if (!matches) return;

        for (const match of matches) {
          const childPid = parseInt(match.replace("ProcessId=", ""), 10);
          if (!isNaN(childPid)) {
            children.push(childPid);
            yield* recurse(childPid);
          }
        }
      });

    yield* recurse(pid);

    if (children.length > 0) {
      yield* Effect.logDebug(
        `[windows] PID ${pid} has ${children.length} descendants`
      );
    }

    return children;
  });

const windowsOperations: PlatformOperations = {
  getPortInfo,
  getProcessTree,
  getMemoryInfo,
  getAllProcesses,
  findChildProcesses,
};

export const WindowsLayer = Layer.succeed(PlatformService, windowsOperations);
