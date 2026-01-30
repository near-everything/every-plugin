import { Effect, Schedule } from "effect";
import { execa } from "execa";
import { CommandFailed, CommandTimeout } from "./errors";

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  retries?: number;
  silent?: boolean;
}

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 1;

export const execCommand = (
  cmd: string,
  args: string[],
  options?: ExecOptions
): Effect.Effect<string, CommandFailed | CommandTimeout> =>
  Effect.gen(function* () {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const silent = options?.silent ?? false;

    if (!silent) {
      yield* Effect.logDebug(`Executing: ${cmd} ${args.join(" ")}`);
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = await execa(cmd, args, {
          cwd: options?.cwd,
          timeout,
          reject: false,
          shell: true,
        });
        return {
          stdout: proc.stdout?.trim() ?? "",
          stderr: proc.stderr?.trim() ?? "",
          exitCode: proc.exitCode,
          timedOut: proc.timedOut,
        };
      },
      catch: (error) => {
        const err = error as { timedOut?: boolean; message?: string };
        if (err.timedOut) {
          return new CommandTimeout({ command: cmd, timeoutMs: timeout });
        }
        return new CommandFailed({
          command: cmd,
          args,
          exitCode: -1,
          stderr: String(error),
        });
      },
    });

    if (result.timedOut) {
      return yield* Effect.fail(
        new CommandTimeout({ command: cmd, timeoutMs: timeout })
      );
    }

    if (result.exitCode !== 0) {
      if (!silent) {
        yield* Effect.logWarning(
          `Command failed: ${cmd} (exit ${result.exitCode})`
        );
      }
      return yield* Effect.fail(
        new CommandFailed({
          command: cmd,
          args,
          exitCode: result.exitCode ?? 1,
          stderr: result.stderr,
        })
      );
    }

    if (!silent) {
      yield* Effect.logDebug(`Command succeeded: ${cmd}`);
    }

    return result.stdout;
  }).pipe(
    Effect.retry(
      Schedule.recurs(options?.retries ?? DEFAULT_RETRIES).pipe(
        Schedule.addDelay(() => "100 millis")
      )
    ),
    Effect.catchAll((error) => Effect.fail(error))
  );

export const execCommandSafe = (
  cmd: string,
  args: string[],
  options?: ExecOptions
): Effect.Effect<string, never> =>
  execCommand(cmd, args, options).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`Command failed (graceful): ${error.message}`);
        return "";
      })
    )
  );

export const execShell = (
  script: string,
  options?: ExecOptions
): Effect.Effect<string, CommandFailed | CommandTimeout> =>
  Effect.gen(function* () {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const silent = options?.silent ?? false;

    if (!silent) {
      yield* Effect.logDebug(`Executing shell: ${script.slice(0, 50)}...`);
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = await execa(script, {
          cwd: options?.cwd,
          timeout,
          reject: false,
          shell: true,
        });
        return {
          stdout: proc.stdout?.trim() ?? "",
          stderr: proc.stderr?.trim() ?? "",
          exitCode: proc.exitCode,
          timedOut: proc.timedOut,
        };
      },
      catch: (error) => {
        const err = error as { timedOut?: boolean; message?: string };
        if (err.timedOut) {
          return new CommandTimeout({ command: script, timeoutMs: timeout });
        }
        return new CommandFailed({
          command: script,
          args: [],
          exitCode: -1,
          stderr: String(error),
        });
      },
    });

    if (result.timedOut) {
      return yield* Effect.fail(
        new CommandTimeout({ command: script, timeoutMs: timeout })
      );
    }

    if (result.exitCode !== 0) {
      if (!silent) {
        yield* Effect.logWarning(
          `Shell command failed (exit ${result.exitCode})`
        );
      }
      return yield* Effect.fail(
        new CommandFailed({
          command: script,
          args: [],
          exitCode: result.exitCode ?? 1,
          stderr: result.stderr,
        })
      );
    }

    return result.stdout;
  }).pipe(
    Effect.retry(
      Schedule.recurs(options?.retries ?? DEFAULT_RETRIES).pipe(
        Schedule.addDelay(() => "100 millis")
      )
    ),
    Effect.catchAll((error) => Effect.fail(error))
  );

export const execShellSafe = (
  script: string,
  options?: ExecOptions
): Effect.Effect<string, never> =>
  execShell(script, options).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(
          `Shell command failed (graceful): ${error.message}`
        );
        return "";
      })
    )
  );

export const powershell = (
  script: string,
  options?: ExecOptions
): Effect.Effect<string, CommandFailed | CommandTimeout> =>
  Effect.gen(function* () {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const silent = options?.silent ?? false;

    if (!silent) {
      yield* Effect.logDebug(`Executing PowerShell: ${script.slice(0, 50)}...`);
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const proc = await execa("powershell", ["-NoProfile", "-Command", script], {
          cwd: options?.cwd,
          timeout,
          reject: false,
        });
        return {
          stdout: proc.stdout?.trim() ?? "",
          stderr: proc.stderr?.trim() ?? "",
          exitCode: proc.exitCode,
          timedOut: proc.timedOut,
        };
      },
      catch: (error) => {
        const err = error as { timedOut?: boolean; message?: string };
        if (err.timedOut) {
          return new CommandTimeout({
            command: "powershell",
            timeoutMs: timeout,
          });
        }
        return new CommandFailed({
          command: "powershell",
          args: [script],
          exitCode: -1,
          stderr: String(error),
        });
      },
    });

    if (result.timedOut) {
      return yield* Effect.fail(
        new CommandTimeout({ command: "powershell", timeoutMs: timeout })
      );
    }

    if (result.exitCode !== 0) {
      if (!silent) {
        yield* Effect.logWarning(
          `PowerShell command failed (exit ${result.exitCode})`
        );
      }
      return yield* Effect.fail(
        new CommandFailed({
          command: "powershell",
          args: [script],
          exitCode: result.exitCode ?? 1,
          stderr: result.stderr,
        })
      );
    }

    return result.stdout;
  }).pipe(
    Effect.retry(
      Schedule.recurs(options?.retries ?? DEFAULT_RETRIES).pipe(
        Schedule.addDelay(() => "100 millis")
      )
    ),
    Effect.catchAll((error) => Effect.fail(error))
  );

export const powershellSafe = (
  script: string,
  options?: ExecOptions
): Effect.Effect<string, never> =>
  powershell(script, options).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(
          `PowerShell command failed (graceful): ${error.message}`
        );
        return "";
      })
    )
  );
