import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { Effect, Logger, LogLevel } from "effect";
import {
  ResourceMonitor,
  PlatformLive,
  createSnapshotWithPlatform,
  diffSnapshots,
  type Snapshot,
  type SnapshotDiff,
  type MonitorConfig,
} from "../lib/resource-monitor";
import { getAccount, getConfigPath } from "../config";
import { colors, divider, gradients, icons, frames } from "../utils/theme";

type Phase = "baseline" | "running" | "stopped";

interface MonitorViewProps {
  baseline: Snapshot | null;
  current: Snapshot | null;
  diff: SnapshotDiff | null;
  phase: Phase;
  refreshing: boolean;
  onRefresh: () => void;
  onSnapshot: () => void;
  onExport: () => void;
  onExit: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PortRow({
  port,
  info,
}: {
  port: number;
  info: { pid: number | null; command: string | null; state: string };
}) {
  const isFree = info.state === "FREE";
  const icon = isFree ? "○" : "●";
  const statusColor = isFree ? "gray" : "#00ff41";

  return (
    <Box>
      <Text color={statusColor}> {icon} </Text>
      <Text color="#00ffff">:{port.toString().padEnd(5)}</Text>
      {isFree ? (
        <Text color="gray">free</Text>
      ) : (
        <Text>
          <Text color="#ff00ff">{info.pid}</Text>
          <Text color="gray"> {info.command}</Text>
        </Text>
      )}
    </Box>
  );
}

function ProcessRow({
  proc,
}: {
  proc: { pid: number; command: string; rss: number; children: number[] };
}) {
  const childCount = proc.children.length;
  const childText = childCount > 0 ? ` [${childCount}]` : "";

  return (
    <Box>
      <Text color="#00ffff"> {proc.pid.toString().padEnd(7)}</Text>
      <Text>{proc.command.slice(0, 20).padEnd(20)}</Text>
      <Text color="#ff00ff">{formatBytes(proc.rss).padStart(10)}</Text>
      <Text color="gray">{childText}</Text>
    </Box>
  );
}

function SnapshotSection({
  title,
  snapshot,
}: {
  title: string;
  snapshot: Snapshot | null;
}) {
  if (!snapshot) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="#00ffff"> {title}</Text>
        <Text color="gray"> (waiting for snapshot...)</Text>
      </Box>
    );
  }

  const ports = Object.entries(snapshot.ports);
  const boundPorts = ports.filter(([, info]) => info.state !== "FREE").length;
  const totalRss = formatBytes(snapshot.memory.processRss);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="#00ffff"> {title}</Text>
      <Text color="gray">{divider(50)}</Text>

      <Text color="gray">
        {" "}
        PORTS ({boundPorts}/{ports.length} bound)
      </Text>
      {ports.map(([port, info]) => (
        <PortRow key={port} port={parseInt(port, 10)} info={info} />
      ))}

      {snapshot.processes.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text color="gray">
              {" "}
              PROCESSES ({snapshot.processes.length})
            </Text>
          </Box>
          {snapshot.processes.slice(0, 8).map((proc) => (
            <ProcessRow key={proc.pid} proc={proc} />
          ))}
          {snapshot.processes.length > 8 && (
            <Text color="gray">
              {" "}
              ... and {snapshot.processes.length - 8} more
            </Text>
          )}
        </>
      )}

      <Box marginTop={1}>
        <Text color="gray"> Memory: {totalRss}</Text>
      </Box>
    </Box>
  );
}

function DiffSection({ diff }: { diff: SnapshotDiff | null }) {
  if (!diff) return null;

  const hasLeaks =
    diff.orphanedProcesses.length > 0 || diff.stillBoundPorts.length > 0;
  const memDelta = diff.memoryDeltaBytes;
  const memSign = memDelta >= 0 ? "+" : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={hasLeaks ? "#ff3366" : "#00ff41"}>
        {hasLeaks ? ` ${icons.err} LEAKS DETECTED` : ` ${icons.ok} CLEAN`}
      </Text>

      {diff.stillBoundPorts.length > 0 && (
        <>
          <Text color="#ff3366"> Still Bound:</Text>
          {diff.stillBoundPorts.map((port) => (
            <Text key={port.port} color="#ff3366">
              {" "}
              :{port.port} ← PID {port.pid}
            </Text>
          ))}
        </>
      )}

      {diff.orphanedProcesses.length > 0 && (
        <>
          <Text color="#ff3366"> Orphaned Processes:</Text>
          {diff.orphanedProcesses.map((proc) => (
            <Text key={proc.pid} color="#ff3366">
              {" "}
              {proc.pid} {proc.command}
            </Text>
          ))}
        </>
      )}

      {diff.freedPorts.length > 0 && (
        <Text color="#00ff41"> Freed: {diff.freedPorts.join(", ")}</Text>
      )}

      <Text color={memDelta > 50 * 1024 * 1024 ? "#ff3366" : "gray"}>
        Memory Delta: {memSign}
        {formatBytes(memDelta)}
      </Text>
    </Box>
  );
}

function MonitorView({
  baseline,
  current,
  diff,
  phase,
  refreshing,
  onRefresh,
  onSnapshot,
  onExport,
  onExit,
}: MonitorViewProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit();
      exit();
    }
    if (input === "r") onRefresh();
    if (input === "s") onSnapshot();
    if (input === "e") onExport();
  });

  let account = "unknown";
  let configPath = "";
  try {
    account = getAccount();
    configPath = getConfigPath();
  } catch {
    // No config
  }

  const phaseLabel =
    phase === "baseline" ? "BASELINE" : phase === "running" ? "RUNNING" : "STOPPED";
  const phaseColor =
    phase === "baseline" ? "gray" : phase === "running" ? "#00ffff" : "#ff00ff";

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text color="#00ffff">{frames.top(56)}</Text>
      </Box>
      <Box>
        <Text>
          {" "}
          {icons.scan} {gradients.cyber("BOS RESOURCE MONITOR")}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="#00ffff">{frames.bottom(56)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray"> Account: </Text>
        <Text color="#00ffff">{account}</Text>
      </Box>
      {configPath && (
        <Box marginBottom={1}>
          <Text color="gray"> Config: </Text>
          <Text color="gray">{configPath}</Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text color="gray"> Phase: </Text>
        <Text color={phaseColor}>{phaseLabel}</Text>
        {refreshing && <Text color="gray"> (refreshing...)</Text>}
      </Box>

      <Text>{colors.dim(divider(56))}</Text>

      {phase === "baseline" && (
        <SnapshotSection title="📊 BASELINE" snapshot={baseline} />
      )}

      {phase === "running" && (
        <>
          <SnapshotSection title="📊 BASELINE" snapshot={baseline} />
          <SnapshotSection title="🔄 CURRENT" snapshot={current} />
        </>
      )}

      {phase === "stopped" && (
        <>
          <SnapshotSection title="🔄 AFTER STOP" snapshot={current} />
          <DiffSection diff={diff} />
        </>
      )}

      <Text>{colors.dim(divider(56))}</Text>
      <Box marginTop={1}>
        <Text color="gray"> [r] refresh [s] snapshot [e] export [q] quit</Text>
      </Box>
    </Box>
  );
}

export interface MonitorViewHandle {
  setPhase: (phase: Phase) => void;
  setBaseline: (snapshot: Snapshot) => void;
  setCurrent: (snapshot: Snapshot) => void;
  setDiff: (diff: SnapshotDiff) => void;
  unmount: () => void;
}

export interface MonitorViewOptions {
  ports?: number[];
  onExit?: () => void;
  onExport?: (data: unknown) => void;
}

const runEffect = <A,>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  effect.pipe(Logger.withMinimumLogLevel(LogLevel.Info), Effect.runPromise);

const runSnapshotEffect = (config?: MonitorConfig): Promise<Snapshot> =>
  createSnapshotWithPlatform(config).pipe(
    Effect.provide(PlatformLive),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.runPromise
  );

export function renderMonitorView(
  options: MonitorViewOptions = {}
): MonitorViewHandle {
  let phase: Phase = "baseline";
  let baseline: Snapshot | null = null;
  let current: Snapshot | null = null;
  let diff: SnapshotDiff | null = null;
  let refreshing = false;
  let rerender: (() => void) | null = null;
  let monitor: ResourceMonitor | null = null;
  const config: MonitorConfig | undefined = options.ports
    ? { ports: options.ports }
    : undefined;

  const initMonitor = async () => {
    monitor = await runEffect(ResourceMonitor.createWithPlatform(config));
  };

  initMonitor();

  const setPhase = (p: Phase) => {
    phase = p;
    rerender?.();
  };

  const setBaseline = (snap: Snapshot) => {
    baseline = snap;
    rerender?.();
  };

  const setCurrent = (snap: Snapshot) => {
    current = snap;
    if (baseline && phase === "stopped") {
      diff = diffSnapshots(baseline, snap);
    }
    rerender?.();
  };

  const setDiff = (d: SnapshotDiff) => {
    diff = d;
    rerender?.();
  };

  const handleRefresh = async () => {
    if (!monitor) return;
    refreshing = true;
    rerender?.();

    const snap = await runEffect(monitor.snapshotWithPlatform());
    if (phase === "baseline") {
      baseline = snap;
    } else {
      current = snap;
      if (baseline && phase === "stopped") {
        diff = diffSnapshots(baseline, snap);
      }
    }

    refreshing = false;
    rerender?.();
  };

  const handleSnapshot = async () => {
    if (!monitor) return;
    const snap = await runEffect(monitor.snapshotWithPlatform());

    if (!baseline) {
      baseline = snap;
      phase = "running";
    } else if (phase === "running") {
      current = snap;
    } else {
      current = snap;
      diff = diffSnapshots(baseline, snap);
    }

    rerender?.();
  };

  const handleExport = async () => {
    if (!monitor) return;
    const exportPath = `.bos/monitor-export-${Date.now()}.json`;
    await runEffect(monitor.export(exportPath));
    options.onExport?.({ path: exportPath });
  };

  const handleExit = () => {
    options.onExit?.();
  };

  function MonitorViewWrapper() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
      rerender = () => forceUpdate((n) => n + 1);

      handleRefresh();

      return () => {
        rerender = null;
      };
    }, []);

    return (
      <MonitorView
        baseline={baseline}
        current={current}
        diff={diff}
        phase={phase}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onSnapshot={handleSnapshot}
        onExport={handleExport}
        onExit={handleExit}
      />
    );
  }

  const { unmount } = render(<MonitorViewWrapper />);

  return { setPhase, setBaseline, setCurrent, setDiff, unmount };
}

export async function runMonitorCli(
  options: { ports?: number[]; json?: boolean } = {}
) {
  const config: MonitorConfig | undefined = options.ports
    ? { ports: options.ports }
    : undefined;

  if (options.json) {
    const snapshot = await runSnapshotEffect(config);
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const monitor = await runEffect(ResourceMonitor.createWithPlatform(config));

  const view = renderMonitorView({
    ports: options.ports,
    onExit: () => process.exit(0),
    onExport: (data) =>
      console.log("Exported to:", (data as { path: string }).path),
  });

  const baseline = await runEffect(monitor.setBaselineWithPlatform());
  view.setBaseline(baseline);
  view.setPhase("baseline");

  const interval = setInterval(async () => {
    const snap = await runEffect(monitor.snapshotWithPlatform());
    view.setCurrent(snap);
  }, 2000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    view.unmount();
    process.exit(0);
  });
}
