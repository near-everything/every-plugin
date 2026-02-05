import type { PortInfo, ProcessInfo, Snapshot, SnapshotDiff } from "./types";

export const diffSnapshots = (from: Snapshot, to: Snapshot): SnapshotDiff => {
  const fromPids = new Set(from.processes.map((p) => p.pid));
  const toPids = new Set(to.processes.map((p) => p.pid));

  const stillBoundPorts: PortInfo[] = [];
  const freedPorts: number[] = [];

  for (const [portStr, fromPort] of Object.entries(from.ports)) {
    const port = parseInt(portStr, 10);
    const toPort = to.ports[port];

    if (fromPort.state === "LISTEN") {
      if (toPort?.state === "LISTEN") {
        stillBoundPorts.push(toPort);
      } else {
        freedPorts.push(port);
      }
    }
  }

  const orphanedProcesses = findOrphanedProcesses(from, to, fromPids, toPids);

  const newProcesses = to.processes.filter((p) => !fromPids.has(p.pid));
  const killedProcesses = from.processes.filter((p) => !toPids.has(p.pid));

  const memoryDeltaBytes = to.memory.processRss - from.memory.processRss;

  return {
    from,
    to,
    orphanedProcesses,
    stillBoundPorts,
    freedPorts,
    memoryDeltaBytes,
    newProcesses,
    killedProcesses,
  };
};

const findOrphanedProcesses = (
  from: Snapshot,
  to: Snapshot,
  fromPids: Set<number>,
  toPids: Set<number>
): ProcessInfo[] => {
  const orphaned: ProcessInfo[] = [];

  for (const toProc of to.processes) {
    const parentPid = toProc.ppid;
    
    if (parentPid <= 1) continue;

    const parentWasTracked = fromPids.has(parentPid);
    const parentIsGone = !toPids.has(parentPid);
    const childStillAlive = toPids.has(toProc.pid);

    if (parentWasTracked && parentIsGone && childStillAlive) {
      orphaned.push(toProc);
    }
  }

  return orphaned;
};

export const hasLeaks = (diff: SnapshotDiff): boolean => {
  return diff.orphanedProcesses.length > 0 || diff.stillBoundPorts.length > 0;
};

export const formatDiff = (diff: SnapshotDiff): string => {
  const lines: string[] = [];
  const elapsed = diff.to.timestamp - diff.from.timestamp;

  lines.push(`Snapshot Diff (${elapsed}ms elapsed)`);
  lines.push("─".repeat(50));

  if (diff.stillBoundPorts.length > 0) {
    lines.push("");
    lines.push("⚠️  STILL BOUND PORTS:");
    for (const port of diff.stillBoundPorts) {
      lines.push(`   :${port.port} ← PID ${port.pid} (${port.command})`);
    }
  }

  if (diff.orphanedProcesses.length > 0) {
    lines.push("");
    lines.push("⚠️  ORPHANED PROCESSES:");
    for (const proc of diff.orphanedProcesses) {
      const mb = (proc.rss / 1024 / 1024).toFixed(1);
      lines.push(`   PID ${proc.pid}: ${proc.command} (${mb} MB)`);
    }
  }

  if (diff.freedPorts.length > 0) {
    lines.push("");
    lines.push("✓  FREED PORTS:");
    lines.push(`   ${diff.freedPorts.join(", ")}`);
  }

  if (diff.killedProcesses.length > 0) {
    lines.push("");
    lines.push("✓  KILLED PROCESSES:");
    for (const proc of diff.killedProcesses) {
      lines.push(`   PID ${proc.pid}: ${proc.command}`);
    }
  }

  lines.push("");
  const memDeltaMb = (diff.memoryDeltaBytes / 1024 / 1024).toFixed(1);
  const sign = diff.memoryDeltaBytes >= 0 ? "+" : "";
  lines.push(`Memory Delta: ${sign}${memDeltaMb} MB`);

  if (!hasLeaks(diff)) {
    lines.push("");
    lines.push("✅ No resource leaks detected");
  }

  return lines.join("\n");
};

export const formatSnapshotSummary = (snapshot: Snapshot): string => {
  const lines: string[] = [];

  lines.push(`Snapshot at ${new Date(snapshot.timestamp).toISOString()}`);
  lines.push(`Platform: ${snapshot.platform}`);
  if (snapshot.configPath) {
    lines.push(`Config: ${snapshot.configPath}`);
  }
  lines.push("");

  lines.push("PORTS:");
  for (const [port, info] of Object.entries(snapshot.ports)) {
    if (info.state === "FREE") {
      lines.push(`  :${port} ○ free`);
    } else {
      lines.push(`  :${port} ● PID ${info.pid} (${info.command})`);
    }
  }

  if (snapshot.processes.length > 0) {
    lines.push("");
    lines.push("PROCESS TREE:");
    for (const proc of snapshot.processes) {
      const mb = (proc.rss / 1024 / 1024).toFixed(1);
      const childCount = proc.children.length;
      const childText = childCount > 0 ? ` [${childCount} children]` : "";
      lines.push(`  ${proc.pid} ${proc.command} (${mb} MB)${childText}`);
    }
  }

  lines.push("");
  const totalMb = (snapshot.memory.processRss / 1024 / 1024).toFixed(1);
  lines.push(`Total Process RSS: ${totalMb} MB`);

  return lines.join("\n");
};
