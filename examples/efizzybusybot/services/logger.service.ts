import { randomUUID } from "node:crypto";
import { Effect } from "every-plugin/effect";

export interface LogContext {
  requestId: string;
  chatId?: string;
  userId?: string;
  username?: string;
  messageId?: number;
  updateId?: number;
}

export interface StructuredLog {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  requestId: string;
  service: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const formatLog = (log: StructuredLog): string => {
  const meta = log.metadata ? ` ${JSON.stringify(log.metadata)}` : "";
  return `[${log.timestamp}] ${log.level} [${log.requestId.slice(0, 8)}] ${log.service}.${log.operation}: ${log.message}${meta}`;
};

export class LoggerService extends Effect.Service<LoggerService>()("LoggerService", {
  effect: Effect.gen(function* () {
    return {
      createContext: (chatId?: string, userId?: string, username?: string, updateId?: number): LogContext => ({
        requestId: randomUUID(),
        chatId,
        userId,
        username,
        updateId,
      }),

      debug: (context: LogContext, service: string, operation: string, message: string, metadata?: Record<string, unknown>) =>
        Effect.gen(function* () {
          const log: StructuredLog = {
            timestamp: new Date().toISOString(),
            level: "DEBUG",
            requestId: context.requestId,
            service,
            operation,
            message,
            metadata,
          };
          yield* Effect.logDebug(formatLog(log));
        }),

      info: (context: LogContext, service: string, operation: string, message: string, metadata?: Record<string, unknown>) =>
        Effect.gen(function* () {
          const log: StructuredLog = {
            timestamp: new Date().toISOString(),
            level: "INFO",
            requestId: context.requestId,
            service,
            operation,
            message,
            metadata,
          };
          yield* Effect.logInfo(formatLog(log));
        }),

      warn: (context: LogContext, service: string, operation: string, message: string, metadata?: Record<string, unknown>) =>
        Effect.gen(function* () {
          const log: StructuredLog = {
            timestamp: new Date().toISOString(),
            level: "WARN",
            requestId: context.requestId,
            service,
            operation,
            message,
            metadata,
          };
          yield* Effect.logWarning(formatLog(log));
        }),

      error: (context: LogContext, service: string, operation: string, message: string, metadata?: Record<string, unknown>) =>
        Effect.gen(function* () {
          const log: StructuredLog = {
            timestamp: new Date().toISOString(),
            level: "ERROR",
            requestId: context.requestId,
            service,
            operation,
            message,
            metadata,
          };
          yield* Effect.logError(formatLog(log));
        }),
    };
  }),
}) { }
