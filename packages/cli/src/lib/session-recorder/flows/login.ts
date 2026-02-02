import { Effect } from "effect";
import { AuthenticationFailed, PopupNotDetected } from "../errors";
import {
  type BrowserHandle,
  clickElement,
  getBrowserMetrics,
  navigateTo,
  sleep,
  waitForPopup,
  waitForSelector,
} from "../playwright";
import type { SessionEventType } from "../types";

interface FlowRecorder {
  recordEvent: (
    type: SessionEventType,
    label: string,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void>;
}

interface LoginFlowOptions {
  baseUrl: string;
  headless: boolean;
  stubWallet: boolean;
  timeout: number;
}

const DEFAULT_LOGIN_OPTIONS: LoginFlowOptions = {
  baseUrl: "http://localhost:3000",
  headless: true,
  stubWallet: true,
  timeout: 30000,
};

export const runLoginFlow = (
  browser: BrowserHandle,
  recorder: FlowRecorder,
  options: Partial<LoginFlowOptions> = {}
): Effect.Effect<void, AuthenticationFailed | PopupNotDetected> =>
  Effect.gen(function* () {
    const opts = { ...DEFAULT_LOGIN_OPTIONS, ...options };
    const { page, context } = browser;

    yield* Effect.logInfo("Starting login flow");
    yield* Effect.asVoid(recorder.recordEvent("custom", "login_flow_start"));

    yield* navigateTo(page, `${opts.baseUrl}/login`);
    yield* Effect.asVoid(recorder.recordEvent("pageload", "/login", { url: `${opts.baseUrl}/login` }));

    yield* sleep(1000);

    const connectButtonSelector = 'button:has-text("connect near wallet")';

    yield* Effect.tryPromise({
      try: () => page.waitForSelector(connectButtonSelector, { timeout: opts.timeout }),
      catch: () => new AuthenticationFailed({
        step: "find_connect_button",
        reason: "Connect wallet button not found",
      }),
    });

    yield* Effect.asVoid(recorder.recordEvent("auth_start", "wallet_connect_initiated"));

    if (opts.headless && opts.stubWallet) {
      yield* Effect.logInfo("Stubbing wallet connection in headless mode");
      yield* Effect.asVoid(recorder.recordEvent("custom", "wallet_stubbed", { reason: "headless_mode" }));

      yield* clickElement(page, connectButtonSelector);

      yield* sleep(2000);

      const hasSignInButton = yield* Effect.tryPromise({
        try: async () => {
          try {
            await page.waitForSelector('button:has-text("sign in as")', { timeout: 5000 });
            return true;
          } catch {
            return false;
          }
        },
        catch: () => false,
      });

      if (hasSignInButton) {
        yield* Effect.asVoid(recorder.recordEvent("custom", "sign_in_button_appeared"));
      } else {
        yield* Effect.asVoid(recorder.recordEvent("custom", "wallet_popup_would_open", {
          note: "In headed mode, NEAR wallet popup would appear here",
        }));
      }

      yield* Effect.asVoid(recorder.recordEvent("auth_complete", "login_flow_completed_stubbed"));

    } else {
      yield* Effect.logInfo("Running full wallet flow (headed mode)");

      yield* clickElement(page, connectButtonSelector);
      yield* Effect.asVoid(recorder.recordEvent("click", "connect_wallet_button"));

      const popupPromise = waitForPopup(context, opts.timeout);

      const popup = yield* Effect.catchAll(popupPromise, () =>
        Effect.fail(new PopupNotDetected({ timeoutMs: opts.timeout }))
      );

      yield* Effect.asVoid(recorder.recordEvent("popup_open", "near_wallet_popup", {
        url: popup.url(),
      }));

      yield* Effect.logInfo("NEAR wallet popup opened - waiting for user interaction");
      yield* Effect.asVoid(recorder.recordEvent("custom", "awaiting_user_approval"));

      yield* sleep(5000);

      const popupClosed = yield* Effect.tryPromise({
        try: async () => {
          try {
            await popup.waitForSelector("body", { timeout: 1000 });
            return false;
          } catch {
            return true;
          }
        },
        catch: () => true,
      });

      if (popupClosed) {
        yield* Effect.asVoid(recorder.recordEvent("popup_close", "near_wallet_popup"));
      }

      const signInButtonSelector = 'button:has-text("sign in as")';
      const hasSignIn = yield* Effect.tryPromise({
        try: async () => {
          try {
            await page.waitForSelector(signInButtonSelector, { timeout: 10000 });
            return true;
          } catch {
            return false;
          }
        },
        catch: () => false,
      });

      if (hasSignIn) {
        yield* Effect.asVoid(recorder.recordEvent("custom", "wallet_connected"));
        yield* clickElement(page, signInButtonSelector);
        yield* Effect.asVoid(recorder.recordEvent("click", "sign_in_button"));
      }

      yield* Effect.asVoid(recorder.recordEvent("auth_complete", "login_flow_completed"));
    }

    yield* Effect.logInfo("Login flow completed");
  });

export const runNavigationFlow = (
  browser: BrowserHandle,
  recorder: FlowRecorder,
  routes: string[],
  baseUrl: string
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Running navigation flow through ${routes.length} routes`);

    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      yield* navigateTo(browser.page, url);
      yield* Effect.asVoid(recorder.recordEvent("navigation", route, { url }));

      yield* sleep(1000);

      yield* Effect.asVoid(recorder.recordEvent("interval", `visited_${route}`));
    }

    yield* Effect.logInfo("Navigation flow completed");
  });

export const runClickFlow = (
  browser: BrowserHandle,
  recorder: FlowRecorder,
  selectors: Array<{ selector: string; label: string }>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Running click flow with ${selectors.length} interactions`);

    for (const { selector, label } of selectors) {
      const exists = yield* Effect.tryPromise({
        try: async () => {
          try {
            await browser.page.waitForSelector(selector, { timeout: 5000 });
            return true;
          } catch {
            return false;
          }
        },
        catch: () => false,
      });

      if (exists) {
        yield* clickElement(browser.page, selector);
        yield* Effect.asVoid(recorder.recordEvent("click", label, { selector }));
        yield* sleep(500);
      } else {
        yield* Effect.logWarning(`Selector not found: ${selector}`);
      }
    }

    yield* Effect.logInfo("Click flow completed");
  });
