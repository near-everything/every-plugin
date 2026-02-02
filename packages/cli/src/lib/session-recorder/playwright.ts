import { Effect } from "effect";
import { BrowserLaunchFailed, BrowserMetricsFailed } from "./errors";
import type { BrowserMetrics } from "./types";

type Browser = {
  newContext: (options?: Record<string, unknown>) => Promise<BrowserContext>;
  close: () => Promise<void>;
};

type BrowserContext = {
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
  on: (event: string, handler: (page: Page) => void) => void;
  waitForEvent: (event: string, options?: { timeout?: number }) => Promise<Page>;
};

type Page = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<void>;
  click: (selector: string, options?: Record<string, unknown>) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<void>;
  waitForLoadState: (state?: string) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  url: () => string;
  title: () => Promise<string>;
  close: () => Promise<void>;
  metrics: () => Promise<Record<string, number>>;
  evaluate: <T>(fn: () => T) => Promise<T>;
};

type CDPSession = {
  send: (method: string) => Promise<Record<string, unknown>>;
  detach: () => Promise<void>;
};

interface PlaywrightModule {
  chromium: {
    launch: (options?: { headless?: boolean; devtools?: boolean }) => Promise<Browser>;
  };
}

let playwrightModule: PlaywrightModule | null = null;

const loadPlaywright = async (): Promise<PlaywrightModule> => {
  if (playwrightModule) return playwrightModule;

  try {
    // @ts-expect-error - playwright may not be installed
    const pw = await import("playwright");
    playwrightModule = pw as PlaywrightModule;
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwright is not installed. Run: bun add -d playwright"
    );
  }
};

export interface BrowserHandle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export const launchBrowser = (
  headless = true
): Effect.Effect<BrowserHandle, BrowserLaunchFailed> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Launching browser (headless: ${headless})`);

    const pw = yield* Effect.tryPromise({
      try: () => loadPlaywright(),
      catch: (e) => new BrowserLaunchFailed({
        reason: String(e),
        headless,
      }),
    });

    const browser = yield* Effect.tryPromise({
      try: () => pw.chromium.launch({
        headless,
        devtools: !headless,
      }),
      catch: (e) => new BrowserLaunchFailed({
        reason: `Failed to launch chromium: ${e}`,
        headless,
      }),
    });

    const context = yield* Effect.tryPromise({
      try: () => browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: "SessionRecorder/1.0",
      }),
      catch: (e) => new BrowserLaunchFailed({
        reason: `Failed to create context: ${e}`,
        headless,
      }),
    });

    const page = yield* Effect.tryPromise({
      try: () => context.newPage(),
      catch: (e) => new BrowserLaunchFailed({
        reason: `Failed to create page: ${e}`,
        headless,
      }),
    });

    yield* Effect.logInfo("Browser launched successfully");

    return {
      browser,
      context,
      page,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  });

export const closeBrowser = (
  handle: BrowserHandle
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Closing browser");
    yield* Effect.promise(() => handle.close());
    yield* Effect.logInfo("Browser closed");
  });

export const getBrowserMetrics = (
  page: Page
): Effect.Effect<BrowserMetrics, BrowserMetricsFailed> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Collecting browser metrics");

    const metrics = yield* Effect.tryPromise({
      try: async () => {
        const pageMetrics = await page.metrics();

        const memoryInfo = await page.evaluate(() => {
          const perf = (performance as Performance & {
            memory?: {
              usedJSHeapSize: number;
              totalJSHeapSize: number;
            };
          });
          return perf.memory ? {
            jsHeapUsedSize: perf.memory.usedJSHeapSize,
            jsHeapTotalSize: perf.memory.totalJSHeapSize,
          } : {
            jsHeapUsedSize: 0,
            jsHeapTotalSize: 0,
          };
        });

        return {
          jsHeapUsedSize: memoryInfo.jsHeapUsedSize,
          jsHeapTotalSize: memoryInfo.jsHeapTotalSize,
          documents: pageMetrics.Documents ?? 0,
          frames: pageMetrics.Frames ?? 0,
          jsEventListeners: pageMetrics.JSEventListeners ?? 0,
          nodes: pageMetrics.Nodes ?? 0,
          layoutCount: pageMetrics.LayoutCount ?? 0,
          recalcStyleCount: pageMetrics.RecalcStyleCount ?? 0,
          scriptDuration: pageMetrics.ScriptDuration ?? 0,
          taskDuration: pageMetrics.TaskDuration ?? 0,
        };
      },
      catch: (e) => new BrowserMetricsFailed({
        reason: String(e),
      }),
    });

    yield* Effect.logDebug(
      `JS Heap: ${(metrics.jsHeapUsedSize / 1024 / 1024).toFixed(1)}MB`
    );

    return metrics;
  });

export const navigateTo = (
  page: Page,
  url: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Navigating to ${url}`);
    yield* Effect.promise(() => page.goto(url, { waitUntil: "networkidle" }));
    yield* Effect.logInfo(`Loaded: ${page.url()}`);
  });

export const clickElement = (
  page: Page,
  selector: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Clicking: ${selector}`);
    yield* Effect.promise(() => page.click(selector));
  });

export const waitForPopup = (
  context: BrowserContext,
  timeoutMs = 30000
): Effect.Effect<Page> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Waiting for popup window");

    const popup = yield* Effect.promise(() =>
      context.waitForEvent("page", { timeout: timeoutMs })
    );

    yield* Effect.promise(() => popup.waitForLoadState("domcontentloaded"));
    yield* Effect.logInfo(`Popup opened: ${popup.url()}`);

    return popup;
  });

export const closePopup = (
  popup: Page
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Closing popup");
    yield* Effect.promise(() => popup.close());
  });

export const waitForSelector = (
  page: Page,
  selector: string,
  timeoutMs = 10000
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Waiting for selector: ${selector}`);
    yield* Effect.promise(() => page.waitForSelector(selector, { timeout: timeoutMs }));
  });

export const fillInput = (
  page: Page,
  selector: string,
  value: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Filling input: ${selector}`);
    yield* Effect.promise(() => page.fill(selector, value));
  });

export const getPageInfo = (
  page: Page
): Effect.Effect<{ url: string; title: string }> =>
  Effect.gen(function* () {
    const url = page.url();
    const title = yield* Effect.promise(() => page.title());
    return { url, title };
  });

export const sleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise((resolve) => setTimeout(resolve, ms)));
