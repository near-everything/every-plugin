import { writeFile } from "node:fs/promises";
import { Effect } from "effect";
import { diffSnapshots, hasLeaks } from "../resource-monitor";
import { ExportFailed } from "./errors";
import type {
  SessionConfig,
  SessionEvent,
  SessionReport,
  SessionSummary,
} from "./types";

export const generateSummary = (
  events: SessionEvent[],
  config: SessionConfig
): SessionSummary => {
  if (events.length === 0) {
    return {
      totalMemoryDeltaMb: 0,
      peakMemoryMb: 0,
      averageMemoryMb: 0,
      processesSpawned: 0,
      processesKilled: 0,
      orphanedProcesses: 0,
      portsUsed: config.ports,
      portsLeaked: 0,
      hasLeaks: false,
      eventCount: 0,
      duration: 0,
    };
  }

  const baselineEvent = events.find((e) => e.type === "baseline");
  const lastEvent = events[events.length - 1];

  const memoryValues = events
    .map((e) => e.snapshot.memory.processRss / 1024 / 1024)
    .filter((v) => v > 0);

  const peakMemoryMb = Math.max(...memoryValues, 0);
  const averageMemoryMb = memoryValues.length > 0
    ? memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length
    : 0;

  const baselineMemory = baselineEvent?.snapshot.memory.processRss ?? 0;
  const finalMemory = lastEvent.snapshot.memory.processRss;
  const totalMemoryDeltaMb = (finalMemory - baselineMemory) / 1024 / 1024;

  const allProcessPids = new Set<number>();
  const finalProcessPids = new Set<number>();

  for (const event of events) {
    for (const proc of event.snapshot.processes) {
      allProcessPids.add(proc.pid);
    }
  }

  for (const proc of lastEvent.snapshot.processes) {
    finalProcessPids.add(proc.pid);
  }

  const processesSpawned = allProcessPids.size;
  const processesKilled = allProcessPids.size - finalProcessPids.size;

  let orphanedProcesses = 0;
  let portsLeaked = 0;
  let leaksDetected = false;

  if (baselineEvent) {
    const diff = diffSnapshots(baselineEvent.snapshot, lastEvent.snapshot);
    orphanedProcesses = diff.orphanedProcesses.length;
    portsLeaked = diff.stillBoundPorts.length;
    leaksDetected = hasLeaks(diff);
  }

  const browserMetricsEvents = events.filter((e) => e.browserMetrics);
  let browserMetricsSummary: SessionSummary["browserMetricsSummary"];

  if (browserMetricsEvents.length > 0) {
    const jsHeapValues = browserMetricsEvents.map(
      (e) => e.browserMetrics!.jsHeapUsedSize / 1024 / 1024
    );
    const layoutCounts = browserMetricsEvents.map(
      (e) => e.browserMetrics!.layoutCount
    );
    const scriptDurations = browserMetricsEvents.map(
      (e) => e.browserMetrics!.scriptDuration
    );

    browserMetricsSummary = {
      peakJsHeapMb: Math.max(...jsHeapValues),
      averageJsHeapMb: jsHeapValues.reduce((a, b) => a + b, 0) / jsHeapValues.length,
      totalLayoutCount: Math.max(...layoutCounts),
      totalScriptDuration: scriptDurations.reduce((a, b) => a + b, 0),
    };
  }

  const duration = lastEvent.timestamp - (baselineEvent?.timestamp ?? events[0].timestamp);

  return {
    totalMemoryDeltaMb,
    peakMemoryMb,
    averageMemoryMb,
    processesSpawned,
    processesKilled,
    orphanedProcesses,
    portsUsed: config.ports,
    portsLeaked,
    hasLeaks: leaksDetected,
    eventCount: events.length,
    duration,
    browserMetricsSummary,
  };
};

export const generateReport = (
  sessionId: string,
  config: SessionConfig,
  events: SessionEvent[],
  startTime: number,
  endTime: number
): SessionReport => {
  const summary = generateSummary(events, config);

  return {
    sessionId,
    config,
    startTime,
    endTime,
    events,
    summary,
    platform: process.platform,
    nodeVersion: process.version,
  };
};

export const exportJSON = (
  report: SessionReport,
  filepath: string
): Effect.Effect<void, ExportFailed> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Exporting session report to ${filepath}`);

    yield* Effect.tryPromise({
      try: () => writeFile(filepath, JSON.stringify(report, null, 2)),
      catch: (e) => new ExportFailed({
        path: filepath,
        reason: String(e),
      }),
    });

    yield* Effect.logInfo(`Report exported: ${report.events.length} events, ${report.summary.duration}ms duration`);
  });

export const formatReportSummary = (report: SessionReport): string => {
  const lines: string[] = [];
  const { summary } = report;

  lines.push("═".repeat(60));
  lines.push("  SESSION REPORT SUMMARY");
  lines.push("═".repeat(60));
  lines.push("");
  lines.push(`  Session ID:     ${report.sessionId}`);
  lines.push(`  Duration:       ${(summary.duration / 1000).toFixed(1)}s`);
  lines.push(`  Events:         ${summary.eventCount}`);
  lines.push(`  Platform:       ${report.platform}`);
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("  MEMORY");
  lines.push("─".repeat(60));
  lines.push(`  Peak:           ${summary.peakMemoryMb.toFixed(1)} MB`);
  lines.push(`  Average:        ${summary.averageMemoryMb.toFixed(1)} MB`);
  lines.push(`  Delta:          ${summary.totalMemoryDeltaMb >= 0 ? "+" : ""}${summary.totalMemoryDeltaMb.toFixed(1)} MB`);
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("  PROCESSES");
  lines.push("─".repeat(60));
  lines.push(`  Spawned:        ${summary.processesSpawned}`);
  lines.push(`  Killed:         ${summary.processesKilled}`);
  lines.push(`  Orphaned:       ${summary.orphanedProcesses}`);
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("  PORTS");
  lines.push("─".repeat(60));
  lines.push(`  Monitored:      ${summary.portsUsed.join(", ")}`);
  lines.push(`  Leaked:         ${summary.portsLeaked}`);
  lines.push("");

  if (summary.browserMetricsSummary) {
    lines.push("─".repeat(60));
    lines.push("  BROWSER METRICS");
    lines.push("─".repeat(60));
    lines.push(`  Peak JS Heap:   ${summary.browserMetricsSummary.peakJsHeapMb.toFixed(1)} MB`);
    lines.push(`  Avg JS Heap:    ${summary.browserMetricsSummary.averageJsHeapMb.toFixed(1)} MB`);
    lines.push(`  Layout Count:   ${summary.browserMetricsSummary.totalLayoutCount}`);
    lines.push(`  Script Time:    ${summary.browserMetricsSummary.totalScriptDuration.toFixed(2)}s`);
    lines.push("");
  }

  lines.push("═".repeat(60));
  if (summary.hasLeaks) {
    lines.push("  ❌ RESOURCE LEAKS DETECTED");
    if (summary.orphanedProcesses > 0) {
      lines.push(`     - ${summary.orphanedProcesses} orphaned process(es)`);
    }
    if (summary.portsLeaked > 0) {
      lines.push(`     - ${summary.portsLeaked} port(s) still bound`);
    }
  } else {
    lines.push("  ✅ NO RESOURCE LEAKS");
  }
  lines.push("═".repeat(60));

  return lines.join("\n");
};

export const formatEventTimeline = (events: SessionEvent[]): string => {
  const lines: string[] = [];

  lines.push("EVENT TIMELINE");
  lines.push("─".repeat(80));

  const baseTime = events[0]?.timestamp ?? 0;

  for (const event of events) {
    const elapsed = ((event.timestamp - baseTime) / 1000).toFixed(2).padStart(8);
    const type = event.type.padEnd(12);
    const memory = (event.snapshot.memory.processRss / 1024 / 1024).toFixed(1).padStart(6);

    lines.push(`  ${elapsed}s  │  ${type}  │  ${memory}MB  │  ${event.label}`);
  }

  lines.push("─".repeat(80));

  return lines.join("\n");
};

export const generateHTMLReport = (report: SessionReport): string => {
  const { summary, events } = report;
  const baseTime = events[0]?.timestamp ?? 0;

  const eventRows = events.map((e) => {
    const elapsed = ((e.timestamp - baseTime) / 1000).toFixed(2);
    const memory = (e.snapshot.memory.processRss / 1024 / 1024).toFixed(1);
    return `<tr>
      <td>${elapsed}s</td>
      <td><span class="event-type event-${e.type}">${e.type}</span></td>
      <td>${memory} MB</td>
      <td>${e.label}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Session Report - ${report.sessionId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card .value { font-size: 2em; font-weight: bold; color: #007bff; }
    .summary-card .label { color: #666; font-size: 0.9em; }
    .status { padding: 15px; border-radius: 8px; margin: 20px 0; }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; }
    .event-type { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; }
    .event-baseline { background: #007bff; color: white; }
    .event-interval { background: #6c757d; color: white; }
    .event-pageload { background: #28a745; color: white; }
    .event-click { background: #ffc107; color: #333; }
    .event-popup_open, .event-popup_close { background: #17a2b8; color: white; }
    .event-auth_start, .event-auth_complete { background: #6f42c1; color: white; }
    .event-custom { background: #fd7e14; color: white; }
    .event-error { background: #dc3545; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Session Report</h1>
    <p><strong>Session ID:</strong> ${report.sessionId}</p>
    <p><strong>Duration:</strong> ${(summary.duration / 1000).toFixed(1)} seconds</p>
    <p><strong>Platform:</strong> ${report.platform} (Node ${report.nodeVersion})</p>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="value">${summary.eventCount}</div>
        <div class="label">Events</div>
      </div>
      <div class="summary-card">
        <div class="value">${summary.peakMemoryMb.toFixed(1)} MB</div>
        <div class="label">Peak Memory</div>
      </div>
      <div class="summary-card">
        <div class="value">${summary.processesSpawned}</div>
        <div class="label">Processes</div>
      </div>
      <div class="summary-card">
        <div class="value">${summary.portsUsed.length}</div>
        <div class="label">Ports Monitored</div>
      </div>
    </div>

    <div class="status ${summary.hasLeaks ? 'error' : 'success'}">
      ${summary.hasLeaks
        ? `❌ Resource leaks detected: ${summary.orphanedProcesses} orphaned processes, ${summary.portsLeaked} ports leaked`
        : '✅ No resource leaks detected'
      }
    </div>

    <h2>Event Timeline</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Event</th>
          <th>Memory</th>
          <th>Label</th>
        </tr>
      </thead>
      <tbody>
        ${eventRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
};

export const exportHTMLReport = (
  report: SessionReport,
  filepath: string
): Effect.Effect<void, ExportFailed> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Exporting HTML report to ${filepath}`);

    const html = generateHTMLReport(report);

    yield* Effect.tryPromise({
      try: () => writeFile(filepath, html),
      catch: (e) => new ExportFailed({
        path: filepath,
        reason: String(e),
      }),
    });

    yield* Effect.logInfo("HTML report exported");
  });
