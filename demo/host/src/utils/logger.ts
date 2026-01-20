import { Effect } from "every-plugin/effect"

export const logger = {
  info: (...args: unknown[]) => Effect.runSync(Effect.logInfo(...args)),
  warn: (...args: unknown[]) => Effect.runSync(Effect.logWarning(...args)),
  error: (...args: unknown[]) => Effect.runSync(Effect.logError(...args)),
}
