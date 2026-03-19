import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface LogEntry {
	timestamp: number;
	source: string;
	line: string;
	isError?: boolean;
}

export interface DevLogger {
	logFile: string;
	latestFile: string;
	write: (entry: LogEntry) => Promise<void>;
	readLatest: (opts?: { tail?: number }) => Promise<string>;
}

export function getBosDir(configDir: string): string {
	return join(configDir, ".bos");
}

export function getLogsDir(configDir: string): string {
	return join(getBosDir(configDir), "logs");
}

function formatLogLine(entry: LogEntry): string {
	const ts = new Date(entry.timestamp).toISOString();
	const prefix = entry.isError ? "ERR" : "OUT";
	return `[${ts}] [${entry.source}] [${prefix}] ${entry.line}`;
}

export async function createDevLogger(
	configDir: string,
	description: string,
): Promise<DevLogger> {
	const dir = getLogsDir(configDir);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}

	const now = new Date();
	const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const logFile = join(dir, `dev-${ts}.log`);
	const latestFile = join(dir, "dev-latest.log");

	const header =
		`# everything-dev-next dev session: ${description}\n` +
		`# Started: ${now.toISOString()}\n\n`;
	// Overwrite each run so dev-latest.log is always actionable.
	await writeFile(logFile, header, "utf8");
	await writeFile(latestFile, header, "utf8");

	let chain = Promise.resolve();
	const enqueue = (fn: () => Promise<void>) => {
		chain = chain.then(fn, fn);
		return chain;
	};

	return {
		logFile,
		latestFile,
		write: (entry) =>
			enqueue(async () => {
				const line = formatLogLine(entry) + "\n";
				await appendFile(logFile, line);
				await appendFile(latestFile, line);
			}),
		readLatest: async (opts) => {
			const text = await readFile(latestFile, "utf8").catch(() => "");
			const tail = opts?.tail;
			if (!tail || tail <= 0) return text;
			const lines = text.split("\n");
			return lines.slice(Math.max(0, lines.length - tail)).join("\n");
		},
	};
}

export async function readDevLatestLog(
	configDir: string,
	opts?: { tail?: number },
): Promise<string> {
	const latestFile = join(getLogsDir(configDir), "dev-latest.log");
	const text = await readFile(latestFile, "utf8").catch(() => "");
	const tail = opts?.tail;
	if (!tail || tail <= 0) return text;
	const lines = text.split("\n");
	return lines.slice(Math.max(0, lines.length - tail)).join("\n");
}
