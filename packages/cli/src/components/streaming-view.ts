import chalk from "chalk";
import { linkify } from "../utils/linkify";
import { colors, icons } from "../utils/theme";
import type { ProcessState, ProcessStatus } from "./dev-view";

const orange = chalk.hex("#ffaa00");

export interface StreamingViewHandle {
  updateProcess: (name: string, status: ProcessStatus, message?: string) => void;
  addLog: (source: string, line: string, isError?: boolean) => void;
  unmount: () => void;
}

const getTimestamp = (): string => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
};

const write = (text: string) => process.stdout.write(text + "\n");

const getServiceColor = (name: string): (s: string) => string => {
  if (name === "host") return colors.cyan;
  if (name === "ui" || name === "ui-ssr") return colors.magenta;
  if (name === "api") return colors.blue;
  return colors.white;
};

const getStatusIcon = (status: ProcessStatus): string => {
  switch (status) {
    case "pending": return icons.pending;
    case "starting": return icons.scan;
    case "ready": return icons.ok;
    case "error": return icons.err;
  }
};

export function renderStreamingView(
  initialProcesses: ProcessState[],
  description: string,
  env: Record<string, string>,
  onExit?: () => void,
  _onExportLogs?: () => void,
): StreamingViewHandle {
  const processes = new Map<string, ProcessState>();
  for (const p of initialProcesses) {
    processes.set(p.name, { ...p });
  }

  let allReadyPrinted = false;
  const hostProcess = initialProcesses.find(p => p.name === "host");
  const hostPort = hostProcess?.port || 3000;
  const proxyTarget = env.API_PROXY;

  console.log();
  console.log(colors.cyan(`${"─".repeat(52)}`));
  console.log(`  ${icons.run} ${colors.cyan(description.toUpperCase())}`);
  console.log(colors.cyan(`${"─".repeat(52)}`));
  console.log();

  if (proxyTarget) {
    console.log(orange(`  ${icons.arrow} API PROXY → ${proxyTarget}`));
    console.log();
  }

  for (const proc of initialProcesses) {
    const color = getServiceColor(proc.name);
    const sourceLabel = proc.source ? ` (${proc.source})` : "";
    console.log(`${colors.dim(`[${getTimestamp()}]`)} ${color(`[${proc.name.toUpperCase()}]`)}  ${icons.pending} waiting${sourceLabel}`);
  }

  const checkAllReady = () => {
    if (allReadyPrinted) return;

    const allReady = Array.from(processes.values()).every(p => p.status === "ready");
    if (allReady) {
      allReadyPrinted = true;
      console.log();
      console.log(colors.dim(`${"─".repeat(52)}`));
      console.log(colors.green(`${icons.ok} All ${processes.size} services ready`));
      console.log(colors.green(`${icons.arrow} http://localhost:${hostPort}`));
      console.log(colors.dim(`${"─".repeat(52)}`));
      console.log();
    }
  };

  const updateProcess = (name: string, status: ProcessStatus, message?: string) => {
    const proc = processes.get(name);
    if (!proc) return;

    proc.status = status;
    if (message) proc.message = message;

    const color = getServiceColor(name);
    const icon = getStatusIcon(status);
    const statusText = status === "ready" ? "ready" : status === "starting" ? "starting" : status === "error" ? "failed" : "waiting";
    const portStr = proc.port > 0 && status === "ready" ? ` :${proc.port}` : "";

    write(`${colors.dim(`[${getTimestamp()}]`)} ${color(`[${name.toUpperCase()}]`)}  ${status === "ready" ? colors.green(icon) : status === "error" ? colors.error(icon) : icon} ${statusText}${portStr}`);

    checkAllReady();
  };

  const addLog = (source: string, line: string, isError = false) => {
    const color = getServiceColor(source);
    const logColor = isError ? colors.error : colors.dim;
    write(`${colors.dim(`[${getTimestamp()}]`)} ${color(`[${source.toUpperCase()}]`)}  ${colors.dim("│")} ${logColor(linkify(line))}`);
  };

  const unmount = () => {
    onExit?.();
  };

  process.on("SIGINT", () => {
    console.log();
    console.log(colors.dim(`[${getTimestamp()}] Shutting down...`));
    unmount();
  });

  return { updateProcess, addLog, unmount };
}
