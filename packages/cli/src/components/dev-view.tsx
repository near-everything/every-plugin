import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { linkify } from "../utils/linkify";
import { colors, divider, gradients, icons, frames } from "../utils/theme";

export type ProcessStatus = "pending" | "starting" | "ready" | "error";

export interface ProcessState {
  name: string;
  status: ProcessStatus;
  port: number;
  message?: string;
  source?: "local" | "remote";
}

export interface LogEntry {
  source: string;
  line: string;
  timestamp: number;
  isError?: boolean;
}

interface DevViewProps {
  processes: ProcessState[];
  logs: LogEntry[];
  description: string;
  onExit?: () => void;
  onExportLogs?: () => void;
}

function StatusIcon({ status }: { status: ProcessStatus }) {
  switch (status) {
    case "pending":
      return <Text color="gray">{icons.pending}</Text>;
    case "starting":
      return <Text color="#00ffff">{icons.scan}</Text>;
    case "ready":
      return <Text color="#00ff41">{icons.ok}</Text>;
    case "error":
      return <Text color="#ff3366">{icons.err}</Text>;
  }
}

function getServiceColor(name: string): string {
  return name === "host" ? "#00ffff" : name === "ui" ? "#ff00ff" : "#0080ff";
}

function ProcessRow({ proc }: { proc: ProcessState }) {
  const color = getServiceColor(proc.name);
  const portStr = proc.port > 0 ? `:${proc.port}` : "";
  const sourceLabel = proc.source ? ` (${proc.source})` : "";

  const statusText =
    proc.status === "pending"
      ? "waiting"
      : proc.status === "starting"
        ? "starting"
        : proc.status === "ready"
          ? "running"
          : "failed";

  return (
    <Box>
      <Text>{"  "}</Text>
      <StatusIcon status={proc.status} />
      <Text> </Text>
      <Text color={color} bold>{proc.name.toUpperCase().padEnd(6)}</Text>
      <Text color="gray">{sourceLabel.padEnd(10)}</Text>
      <Text color={proc.status === "ready" ? "#00ff41" : "gray"}>
        {statusText}
      </Text>
      {proc.port > 0 && (
        <Text color="#00ffff"> {portStr}</Text>
      )}
    </Box>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const color = getServiceColor(entry.source);

  return (
    <Box>
      <Text color={color}>[{entry.source}]</Text>
      <Text color={entry.isError ? "#ff3366" : undefined}> {linkify(entry.line)}</Text>
    </Box>
  );
}

function DevView({
  processes,
  logs,
  description,
  onExit,
  onExportLogs,
}: DevViewProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onExit?.();
      exit();
    }
    if (input === "l") {
      onExportLogs?.();
      exit();
    }
  });

  const readyCount = processes.filter((p) => p.status === "ready").length;
  const total = processes.length;
  const allReady = readyCount === total;
  const hostProcess = processes.find((p) => p.name === "host");
  const hostPort = hostProcess?.port || 3000;

  const recentLogs = logs.slice(-12);

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text color="#00ffff">{frames.top(52)}</Text>
      </Box>
      <Box>
        <Text>
          {"  "}
          {icons.run} {gradients.cyber(description.toUpperCase())}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="#00ffff">{frames.bottom(52)}</Text>
      </Box>

      {allReady && (
        <Box marginBottom={1} flexDirection="column">
          <Box>
            <Text color="#00ff41">{"  "}{icons.app} APP READY</Text>
          </Box>
          <Box>
            <Text color="#00ff41" bold>{"  "}{icons.arrow} http://localhost:{hostPort}</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={0} marginBottom={0}>
        <Text>{colors.dim(divider(52))}</Text>
      </Box>

      {processes.map((proc) => (
        <ProcessRow key={proc.name} proc={proc} />
      ))}

      <Box marginTop={1} marginBottom={0}>
        <Text>{colors.dim(divider(52))}</Text>
      </Box>

      <Box marginTop={0}>
        <Text color={allReady ? "#00ff41" : "#00ffff"}>
          {"  "}
          {allReady
            ? `${icons.ok} All ${total} services running`
            : `${icons.scan} ${readyCount}/${total} ready`}
        </Text>
        <Text color="gray"> {icons.dot} q quit {icons.dot} l logs</Text>
      </Box>

      {recentLogs.length > 0 && (
        <>
          <Box marginTop={1} marginBottom={0}>
            <Text>{colors.dim(divider(52))}</Text>
          </Box>
          <Box flexDirection="column" marginTop={0}>
            {recentLogs.map((entry, i) => (
              <LogLine key={`${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

export interface DevViewHandle {
  updateProcess: (
    name: string,
    status: ProcessStatus,
    message?: string,
  ) => void;
  addLog: (source: string, line: string, isError?: boolean) => void;
  unmount: () => void;
}

export function renderDevView(
  initialProcesses: ProcessState[],
  description: string,
  env: Record<string, string>,
  onExit?: () => void,
  onExportLogs?: () => void,
): DevViewHandle {
  let processes = [...initialProcesses];
  let logs: LogEntry[] = [];
  let rerender: (() => void) | null = null;

  const updateProcess = (
    name: string,
    status: ProcessStatus,
    message?: string,
  ) => {
    processes = processes.map((p) =>
      p.name === name ? { ...p, status, message } : p,
    );
    rerender?.();
  };

  const addLog = (source: string, line: string, isError = false) => {
    logs = [...logs, { source, line, timestamp: Date.now(), isError }];
    if (logs.length > 100) logs = logs.slice(-100);
    rerender?.();
  };

  function DevViewWrapper() {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
      rerender = () => forceUpdate((n) => n + 1);
      return () => {
        rerender = null;
      };
    }, []);

    return (
      <DevView
        processes={processes}
        logs={logs}
        description={description}
        onExit={onExit}
        onExportLogs={onExportLogs}
      />
    );
  }

  const { unmount } = render(<DevViewWrapper />);

  return { updateProcess, addLog, unmount };
}
