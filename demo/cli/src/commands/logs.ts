import path from "path";
import { colors, icons, gradients, divider } from "../utils/theme";

interface LogsOptions {
  lines?: number;
  copy?: boolean;
  file?: string;
}

const getLogDir = () => path.join(process.cwd(), ".bos", "logs");

async function getLatestLogFile(): Promise<string | null> {
  const dir = getLogDir();
  const dirFile = Bun.file(dir);
  
  try {
    const glob = new Bun.Glob("dev-*.log");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: dir })) {
      files.push(file);
    }
    
    if (files.length === 0) return null;
    files.sort().reverse();
    return path.join(dir, files[0]);
  } catch {
    return null;
  }
}

async function listLogFiles(): Promise<string[]> {
  const dir = getLogDir();
  
  try {
    const glob = new Bun.Glob("dev-*.log");
    const files: string[] = [];
    for await (const file of glob.scan({ cwd: dir })) {
      files.push(file);
    }
    return files.sort().reverse();
  } catch {
    return [];
  }
}

export async function logsCommand(options: LogsOptions) {
  const lines = options.lines ?? 50;

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.scan} ${gradients.cyber("DEV SESSION LOGS")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  if (options.file === "list") {
    const files = await listLogFiles();
    if (files.length === 0) {
      console.log(colors.dim("  No log files found."));
      console.log(colors.dim("  Run `bos dev` to generate logs."));
    } else {
      console.log(`  ${colors.bold("Available log files:")}`);
      console.log();
      for (const file of files.slice(0, 10)) {
        console.log(colors.dim(`  |- ${file}`));
      }
      if (files.length > 10) {
        console.log(colors.dim(`  |- ... and ${files.length - 10} more`));
      }
    }
    console.log();
    return;
  }

  let logFile: string | null = null;

  if (options.file) {
    const fullPath = path.join(getLogDir(), options.file);
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      logFile = fullPath;
    } else {
      console.error(colors.magenta(`${icons.err} Log file not found: ${options.file}`));
      console.log(colors.dim("  Use `bos logs --file list` to see available files."));
      console.log();
      return;
    }
  } else {
    logFile = await getLatestLogFile();
  }

  if (!logFile) {
    console.log(colors.dim("  No log files found."));
    console.log(colors.dim("  Run `bos dev` to generate logs."));
    console.log();
    return;
  }

  const file = Bun.file(logFile);
  const content = await file.text();
  const allLines = content.split("\n").filter((l) => l.trim());
  const displayLines = allLines.slice(-lines);

  console.log(`  ${colors.dim("File:")} ${path.basename(logFile)}`);
  console.log(`  ${colors.dim("Lines:")} ${displayLines.length}/${allLines.length}`);
  console.log();
  console.log(colors.dim(divider(48)));
  console.log();

  for (const line of displayLines) {
    const hostMatch = line.includes("[host]");
    const uiMatch = line.includes("[ui]");
    const apiMatch = line.includes("[api]");
    const errMatch = line.includes("[ERR]");

    let color = colors.white;
    if (hostMatch) color = colors.cyan;
    else if (uiMatch) color = colors.magenta;
    else if (apiMatch) color = colors.neonGreen;

    if (errMatch) {
      console.log(colors.magenta(line));
    } else {
      console.log(color(line));
    }
  }

  console.log();
  console.log(colors.dim(divider(48)));

  if (options.copy) {
    try {
      const logContent = displayLines.join("\n");
      const proc = Bun.spawn(["pbcopy"], {
        stdin: "pipe",
      });
      proc.stdin.write(logContent);
      proc.stdin.end();
      await proc.exited;
      
      console.log();
      console.log(colors.neonGreen(`  ${icons.ok} Copied ${displayLines.length} lines to clipboard`));
    } catch {
      console.log();
      console.log(colors.magenta(`  ${icons.err} Failed to copy to clipboard`));
      console.log(colors.dim(`  Full log at: ${logFile}`));
    }
  } else {
    console.log();
    console.log(colors.dim(`  Full log: ${logFile}`));
    console.log(colors.dim(`  Use --copy to copy to clipboard`));
  }

  console.log();
}
