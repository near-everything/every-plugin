import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { colors, divider, gradients, icons } from "../utils/theme";

export type ProcessStatus = "pending" | "starting" | "ready" | "error";

export interface ProcessState {
  name: string;
  status: ProcessStatus;
  port: number;
  message?: string;
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
  env: Record<string, string>;
  onExit?: () => void;
  onExportLogs?: () => void;
}

function StatusIcon({ status }: { status: ProcessStatus }) {
  switch (status) {
    case "pending":
      return <Text color="gray">[ ]</Text>;
    case "starting":
      return <Text color="cyan">[~]</Text>;
    case "ready":
      return <Text color="green">[-]</Text>;
    case "error":
      return <Text color="magenta">[!]</Text>;
  }
}

function getServiceColor(name: string): string {
  return name === "host" ? "cyan" : name === "ui" ? "magenta" : "green";
}

function UrlRow({ proc }: { proc: ProcessState }) {
  const color = getServiceColor(proc.name);
  const url = `http://localhost:${proc.port}`;
  const isReady = proc.status === "ready";

  return (
    <Box>
      <Text>{"  "}</Text>
      <Text color={isReady ? color : "gray"}>{url}</Text>
      <Text color="gray"> ({proc.name})</Text>
    </Box>
  );
}

function ProcessRow({ proc }: { proc: ProcessState }) {
  const color = getServiceColor(proc.name);

  const statusText =
    proc.status === "pending"
      ? "waiting..."
      : proc.status === "starting"
        ? "starting..."
        : proc.status === "ready"
          ? "running"
          : "failed";

  return (
    <Box>
      <Text>{"  "}</Text>
      <StatusIcon status={proc.status} />
      <Text> </Text>
      <Text color={color}>{proc.name.toUpperCase().padEnd(8)}</Text>
      <Text color={proc.status === "ready" ? "green" : "gray"}>
        {statusText}
      </Text>
    </Box>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const color =
    entry.source === "host"
      ? "cyan"
      : entry.source === "ui"
        ? "magenta"
        : "green";

  return (
    <Box>
      <Text color={color}>[{entry.source}]</Text>
      <Text color={entry.isError ? "red" : undefined}> {entry.line}</Text>
    </Box>
  );
}

function DevView({
  processes,
  logs,
  description,
  env,
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

  const recentLogs = logs.slice(-15);

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text>{colors.cyan(`+${"-".repeat(50)}+`)}</Text>
      </Box>
      <Box>
        <Text>
          {"  "}
          {icons.run} {gradients.cyber(`LAUNCHING ${description}`)}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{colors.cyan(`+${"-".repeat(50)}+`)}</Text>
      </Box>

      {processes.filter((proc) => proc.port > 0).map((proc) => (
        <UrlRow key={`url-${proc.name}`} proc={proc} />
      ))}

      <Box marginTop={1} marginBottom={0}>
        <Text>{colors.dim(divider(52))}</Text>
      </Box>

      {processes.map((proc) => (
        <ProcessRow key={proc.name} proc={proc} />
      ))}

      {Object.keys(env).length > 0 && (
        <Box marginTop={1}>
          {Object.entries(env).map(([k, v]) => (
            <Text key={k} color="gray">
              {"  "}
              {k}={v}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} marginBottom={1}>
        <Text>{colors.dim(divider(52))}</Text>
      </Box>

      <Box>
        <Text color={allReady ? "green" : "cyan"}>
          {"  "}
          {allReady
            ? `${icons.ok} All ${total} services running`
            : `${icons.scan} ${readyCount}/${total} ready`}
        </Text>
        <Text color="gray"> • q quit • l export logs</Text>
      </Box>

      {recentLogs.length > 0 && (
        <>
          <Box marginTop={1} marginBottom={0}>
            <Text>{colors.dim(divider(52))}</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
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
        env={env}
        onExit={onExit}
        onExportLogs={onExportLogs}
      />
    );
  }

  const { unmount } = render(<DevViewWrapper />);

  return { updateProcess, addLog, unmount };
}
