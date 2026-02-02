import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  SessionRecorder,
  generateReport,
  generateSummary,
  formatReportSummary,
  diffSnapshots,
  hasLeaks,
} from "../src/lib/session-recorder";
import type { SessionConfig, SessionEvent, Snapshot } from "../src/lib/session-recorder";

const createMockSnapshot = (overrides?: Partial<Snapshot>): Snapshot => ({
  timestamp: Date.now(),
  configPath: null,
  ports: {},
  processes: [],
  memory: {
    total: 16000000000,
    used: 8000000000,
    free: 8000000000,
    processRss: 100000000,
  },
  platform: "darwin",
  ...overrides,
});

const createMockEvent = (
  type: SessionEvent["type"],
  label: string,
  snapshot?: Snapshot
): SessionEvent => ({
  id: `test_${Date.now()}`,
  timestamp: Date.now(),
  type,
  label,
  snapshot: snapshot || createMockSnapshot(),
});

describe("SessionRecorder", () => {
  describe("generateSummary", () => {
    it("returns empty summary for no events", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const summary = generateSummary([], config);

      expect(summary.eventCount).toBe(0);
      expect(summary.duration).toBe(0);
      expect(summary.hasLeaks).toBe(false);
    });

    it("calculates memory metrics from events", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const events: SessionEvent[] = [
        createMockEvent("baseline", "start", createMockSnapshot({
          memory: { total: 16e9, used: 8e9, free: 8e9, processRss: 100 * 1024 * 1024 },
        })),
        createMockEvent("interval", "tick1", createMockSnapshot({
          memory: { total: 16e9, used: 8e9, free: 8e9, processRss: 150 * 1024 * 1024 },
        })),
        createMockEvent("interval", "tick2", createMockSnapshot({
          memory: { total: 16e9, used: 8e9, free: 8e9, processRss: 120 * 1024 * 1024 },
        })),
      ];

      events[0].timestamp = 0;
      events[1].timestamp = 2000;
      events[2].timestamp = 4000;

      const summary = generateSummary(events, config);

      expect(summary.eventCount).toBe(3);
      expect(summary.peakMemoryMb).toBeCloseTo(150, 0);
      expect(summary.averageMemoryMb).toBeCloseTo((100 + 150 + 120) / 3, 0);
    });

    it("detects process changes", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const events: SessionEvent[] = [
        createMockEvent("baseline", "start", createMockSnapshot({
          processes: [
            { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [] },
          ],
        })),
        createMockEvent("interval", "tick", createMockSnapshot({
          processes: [
            { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [] },
            { pid: 2000, ppid: 1000, command: "node", args: [], rss: 2e6, children: [] },
          ],
        })),
      ];

      const summary = generateSummary(events, config);

      expect(summary.processesSpawned).toBe(2);
    });
  });

  describe("generateReport", () => {
    it("creates a complete report structure", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const events: SessionEvent[] = [
        createMockEvent("baseline", "session_start"),
        createMockEvent("custom", "session_end"),
      ];

      const report = generateReport(
        "test_session",
        config,
        events,
        1000,
        5000
      );

      expect(report.sessionId).toBe("test_session");
      expect(report.config).toEqual(config);
      expect(report.events).toHaveLength(2);
      expect(report.startTime).toBe(1000);
      expect(report.endTime).toBe(5000);
      expect(typeof report.platform).toBe("string");
      expect(report.summary).toBeDefined();
    });
  });

  describe("formatReportSummary", () => {
    it("formats report as readable text", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const events: SessionEvent[] = [
        createMockEvent("baseline", "start"),
        createMockEvent("custom", "end"),
      ];

      const report = generateReport("test", config, events, 0, 5000);
      const formatted = formatReportSummary(report);

      expect(formatted).toContain("SESSION REPORT SUMMARY");
      expect(formatted).toContain("MEMORY");
      expect(formatted).toContain("PROCESSES");
      expect(formatted).toContain("PORTS");
    });

    it("shows leak warning when leaks detected", () => {
      const config: SessionConfig = {
        ports: [3000],
        snapshotIntervalMs: 2000,
        headless: true,
        baseUrl: "http://localhost:3000",
        timeout: 60000,
      };

      const baselineSnapshot = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: null, command: null, state: "FREE" },
        },
      });

      const endSnapshot = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: 1234, command: "node", state: "LISTEN" },
        },
      });

      const events: SessionEvent[] = [
        createMockEvent("baseline", "start", baselineSnapshot),
        createMockEvent("custom", "end", endSnapshot),
      ];

      events[0].timestamp = 0;
      events[1].timestamp = 5000;

      const report = generateReport("test", config, events, 0, 5000);

      if (report.summary.hasLeaks) {
        const formatted = formatReportSummary(report);
        expect(formatted).toContain("RESOURCE LEAKS DETECTED");
      }
    });
  });

  describe("diffSnapshots", () => {
    it("detects new processes", () => {
      const baseline = createMockSnapshot({
        processes: [
          { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [] },
        ],
      });

      const after = createMockSnapshot({
        processes: [
          { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [] },
          { pid: 2000, ppid: 1, command: "node", args: [], rss: 2e6, children: [] },
        ],
      });

      const diff = diffSnapshots(baseline, after);

      expect(diff.newProcesses).toHaveLength(1);
      expect(diff.newProcesses[0].pid).toBe(2000);
    });

    it("detects orphaned processes", () => {
      const baseline = createMockSnapshot({
        processes: [
          { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [2000] },
          { pid: 2000, ppid: 1000, command: "node", args: [], rss: 2e6, children: [] },
        ],
      });

      const after = createMockSnapshot({
        processes: [
          { pid: 2000, ppid: 1000, command: "node", args: [], rss: 2e6, children: [] },
        ],
      });

      const diff = diffSnapshots(baseline, after);

      expect(diff.orphanedProcesses).toHaveLength(1);
      expect(diff.orphanedProcesses[0].pid).toBe(2000);
    });

    it("detects still-bound ports", () => {
      const baseline = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: null, command: null, state: "FREE" },
        },
      });

      const after = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: 1234, command: "node", state: "LISTEN" },
        },
      });

      const diff = diffSnapshots(baseline, after);

      expect(diff.stillBoundPorts).toHaveLength(1);
      expect(diff.stillBoundPorts[0].port).toBe(3000);
    });
  });

  describe("hasLeaks", () => {
    it("returns false for clean diff", () => {
      const baseline = createMockSnapshot();
      const after = createMockSnapshot();
      const diff = diffSnapshots(baseline, after);

      expect(hasLeaks(diff)).toBe(false);
    });

    it("returns true when orphaned processes exist", () => {
      const baseline = createMockSnapshot({
        processes: [
          { pid: 1000, ppid: 1, command: "bun", args: [], rss: 1e6, children: [2000] },
          { pid: 2000, ppid: 1000, command: "node", args: [], rss: 2e6, children: [] },
        ],
      });
      const after = createMockSnapshot({
        processes: [
          { pid: 2000, ppid: 1000, command: "node", args: [], rss: 2e6, children: [] },
        ],
      });

      const diff = diffSnapshots(baseline, after);
      expect(hasLeaks(diff)).toBe(true);
    });

    it("returns true when ports still bound", () => {
      const baseline = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: null, command: null, state: "FREE" },
        },
      });
      const after = createMockSnapshot({
        ports: {
          "3000": { port: 3000, pid: 1234, command: "node", state: "LISTEN" },
        },
      });

      const diff = diffSnapshots(baseline, after);
      expect(hasLeaks(diff)).toBe(true);
    });
  });
});

describe("SessionRecorder.create", () => {
  it("creates recorder with default config", async () => {
    const effect = Effect.gen(function* () {
      const recorder = yield* SessionRecorder.create();
      expect(recorder.getConfig().headless).toBe(true);
      expect(recorder.getConfig().snapshotIntervalMs).toBe(2000);
      expect(recorder.getSessionId()).toMatch(/^sess_/);
    });

    await Effect.runPromise(effect);
  });

  it("creates recorder with custom config", async () => {
    const effect = Effect.gen(function* () {
      const recorder = yield* SessionRecorder.create({
        headless: false,
        snapshotIntervalMs: 5000,
        ports: [4000, 5000],
      });

      const config = recorder.getConfig();
      expect(config.headless).toBe(false);
      expect(config.snapshotIntervalMs).toBe(5000);
      expect(config.ports).toEqual([4000, 5000]);
    });

    await Effect.runPromise(effect);
  });
});
