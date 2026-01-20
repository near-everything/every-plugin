import { spawn } from "node:child_process";
import { confirm } from "@inquirer/prompts";
import { Effect } from "every-plugin/effect";
import { colors, icons } from "../utils/theme";

export interface TransactionConfig {
  account: string;
  contract: string;
  method: string;
  argsBase64: string;
  network?: "mainnet" | "testnet";
  privateKey?: string;
  gas?: string;
  deposit?: string;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const NEAR_CLI_VERSION = "0.23.5";
const INSTALLER_URL = `https://github.com/near/near-cli-rs/releases/download/v${NEAR_CLI_VERSION}/near-cli-rs-installer.sh`;

export class NearCliNotFoundError extends Error {
  readonly _tag = "NearCliNotFoundError";
  constructor() {
    super("NEAR CLI not found");
  }
}

export class NearCliInstallError extends Error {
  readonly _tag = "NearCliInstallError";
  constructor(message: string) {
    super(`Failed to install NEAR CLI: ${message}`);
  }
}

export class TransactionError extends Error {
  readonly _tag = "TransactionError";
  constructor(message: string) {
    super(message);
  }
}

const checkNearCliInstalled = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    try: async () => {
      return new Promise<boolean>((resolve) => {
        const proc = spawn("near", ["--version"], { shell: true, stdio: "pipe" });
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      });
    },
    catch: () => new Error("Failed to check NEAR CLI"),
  });
  return result;
});

const installNearCli = Effect.gen(function* () {
  console.log();
  console.log(`  ${icons.pkg} Installing NEAR CLI v${NEAR_CLI_VERSION}...`);
  console.log(colors.dim(`  Using official installer from GitHub`));
  console.log();

  yield* Effect.tryPromise({
    try: async () => {
      return new Promise<void>((resolve, reject) => {
        const proc = spawn("sh", ["-c", `curl --proto '=https' --tlsv1.2 -LsSf ${INSTALLER_URL} | sh`], {
          stdio: "inherit",
          shell: true,
        });
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new NearCliInstallError(`Installer exited with code ${code}`));
        });
        proc.on("error", (err) => reject(new NearCliInstallError(err.message)));
      });
    },
    catch: (e) => e as Error,
  });

  console.log();
  console.log(colors.green(`  ${icons.ok} NEAR CLI installed successfully`));
});

export const ensureNearCli = Effect.gen(function* () {
  const isInstalled = yield* checkNearCliInstalled;

  if (isInstalled) {
    return;
  }

  console.log();
  console.log(colors.error(`  ${icons.err} NEAR CLI not found`));

  const shouldInstall = yield* Effect.tryPromise({
    try: () => confirm({
      message: "Install NEAR CLI? (required for publishing)",
      default: true,
    }),
    catch: () => new Error("Prompt cancelled"),
  });

  if (!shouldInstall) {
    console.log();
    console.log(colors.dim("  To install manually:"));
    console.log(colors.dim(`  curl --proto '=https' --tlsv1.2 -LsSf ${INSTALLER_URL} | sh`));
    console.log();
    yield* Effect.fail(new NearCliNotFoundError());
  }

  yield* installNearCli;
});

export const executeTransaction = (config: TransactionConfig): Effect.Effect<TransactionResult, Error> =>
  Effect.gen(function* () {
    const gas = (config.gas || "300Tgas").replace(/\s+/g, "");
    const deposit = (config.deposit || "0NEAR").replace(/\s+/g, "");
    const network = config.network || (config.account.endsWith(".testnet") ? "testnet" : "mainnet");

    const args = [
      "contract",
      "call-function",
      "as-transaction",
      config.contract,
      config.method,
      "base64-args",
      config.argsBase64,
      "prepaid-gas",
      gas,
      "attached-deposit",
      deposit,
      "sign-as",
      config.account,
      "network-config",
      network,
    ];

    if (config.privateKey) {
      args.push("sign-with-plaintext-private-key", config.privateKey, "send");
    }

    console.log();
    console.log(`  ${icons.run} Executing transaction...`);
    console.log(colors.dim(`  Contract: ${config.contract}`));
    console.log(colors.dim(`  Method: ${config.method}`));
    console.log(colors.dim(`  Signer: ${config.account}`));
    console.log();

    const output = yield* Effect.tryPromise({
      try: async () => {
        return new Promise<string>((resolve, reject) => {
          const proc = spawn("near", args, {
            shell: true,
            stdio: ["inherit", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";

          proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
          });

          proc.stderr?.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text);
          });

          proc.on("close", (code) => {
            if (code === 0) {
              resolve(stdout);
            } else {
              reject(new TransactionError(stderr || `Transaction failed with code ${code}`));
            }
          });

          proc.on("error", (err) => {
            reject(new TransactionError(err.message));
          });
        });
      },
      catch: (e) => e as Error,
    });

    const txHashMatch = output.match(/Transaction ID:\s*([A-Za-z0-9]+)/i) ||
      output.match(/([A-HJ-NP-Za-km-z1-9]{43,44})/);

    const txHash = txHashMatch?.[1] || "unknown";

    return {
      success: true,
      txHash,
    };
  });
