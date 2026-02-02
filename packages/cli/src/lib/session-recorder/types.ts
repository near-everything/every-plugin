import type { Snapshot } from "../resource-monitor";

export interface SessionConfig {
  ports: number[];
  snapshotIntervalMs: number;
  headless: boolean;
  baseUrl: string;
  timeout: number;
  outputPath?: string;
  devMode?: "local" | "remote";
}

export interface BrowserMetrics {
  jsHeapUsedSize: number;
  jsHeapTotalSize: number;
  documents: number;
  frames: number;
  jsEventListeners: number;
  nodes: number;
  layoutCount: number;
  recalcStyleCount: number;
  scriptDuration: number;
  taskDuration: number;
}

export type SessionEventType =
  | "baseline"
  | "interval"
  | "pageload"
  | "navigation"
  | "click"
  | "popup_open"
  | "popup_close"
  | "auth_start"
  | "auth_complete"
  | "auth_failed"
  | "error"
  | "custom";

export interface SessionEvent {
  id: string;
  timestamp: number;
  type: SessionEventType;
  label: string;
  snapshot: Snapshot;
  browserMetrics?: BrowserMetrics;
  url?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  totalMemoryDeltaMb: number;
  peakMemoryMb: number;
  averageMemoryMb: number;
  processesSpawned: number;
  processesKilled: number;
  orphanedProcesses: number;
  portsUsed: number[];
  portsLeaked: number;
  hasLeaks: boolean;
  eventCount: number;
  duration: number;
  browserMetricsSummary?: {
    peakJsHeapMb: number;
    averageJsHeapMb: number;
    totalLayoutCount: number;
    totalScriptDuration: number;
  };
}

export interface SessionReport {
  sessionId: string;
  config: SessionConfig;
  startTime: number;
  endTime: number;
  events: SessionEvent[];
  summary: SessionSummary;
  platform: NodeJS.Platform;
  nodeVersion: string;
}

export interface ServerHandle {
  pid: number;
  port: number;
  name: string;
  kill: () => Promise<void>;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

export interface ServerOrchestrator {
  handles: ServerHandle[];
  ports: number[];
  shutdown: () => Promise<void>;
  waitForReady: () => Promise<boolean>;
}

export type SessionFlow = (context: FlowContext) => Promise<void>;

export interface FlowContext {
  page: unknown;
  context: unknown;
  recordEvent: (type: SessionEventType, label: string, metadata?: Record<string, unknown>) => Promise<void>;
  headless: boolean;
  baseUrl: string;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  ports: [3000, 3002, 3014],
  snapshotIntervalMs: 2000,
  headless: true,
  baseUrl: "http://localhost:3000",
  timeout: 120000,
  devMode: "remote",
};
