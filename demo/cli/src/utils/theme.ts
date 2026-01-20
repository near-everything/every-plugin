import gradient from "gradient-string";
import chalk from "chalk";

export const gradients = {
  cyber: gradient(["#00ffff", "#ff00ff"]),
  matrix: gradient(["#003300", "#00ff41"]),
  frost: gradient(["#0080ff", "#00ffff"]),
  neon: gradient(["#00ff41", "#00ffff"]),
};

export const colors = {
  cyan: chalk.hex("#00ffff"),
  magenta: chalk.hex("#ff00ff"),
  green: chalk.hex("#00ff41"),
  blue: chalk.hex("#0080ff"),
  purple: chalk.hex("#bf00ff"),
  white: chalk.hex("#f0f0f0"),
  gray: chalk.hex("#555555"),
  dim: chalk.dim,
  bold: chalk.bold,
  error: chalk.hex("#ff3366"),
};

export const icons = {
  config: "◆",
  host: "●",
  pkg: "▸",
  scan: "○",
  run: "▶",
  test: "◇",
  db: "▪",
  clean: "✕",
  ok: "✓",
  err: "✗",
  pending: "○",
  arrow: "→",
  line: "─",
  dot: "·",
  bar: "│",
  corner: "└",
  app: "◉",
};

export const frames = {
  top: (width: number) => `┌${"─".repeat(width - 2)}┐`,
  bottom: (width: number) => `└${"─".repeat(width - 2)}┘`,
  side: "│",
  empty: (width: number) => `│${" ".repeat(width - 2)}│`,
};

export function box(content: string, width = 50): string {
  const lines = content.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), width - 4);
  const innerWidth = maxLen + 2;
  const totalWidth = innerWidth + 2;

  const top = frames.top(totalWidth);
  const bottom = frames.bottom(totalWidth);
  const body = lines
    .map((line) => {
      const padding = " ".repeat(maxLen - stripAnsi(line).length);
      return `${frames.side} ${line}${padding} ${frames.side}`;
    })
    .join("\n");

  return `${top}\n${body}\n${bottom}`;
}

function stripAnsi(str: string): string {
  const ansiPattern = new RegExp("\\x1b\\[[0-9;]*m", "g");
  return str.replace(ansiPattern, "");
}

export function header(text: string): string {
  const styled = gradients.cyber(text);
  return box(styled);
}

export function divider(width = 48): string {
  return colors.dim("─".repeat(width));
}

export function label(text: string): string {
  return colors.cyan(text);
}

export function value(text: string): string {
  return colors.white(text);
}

export function success(text: string): string {
  return colors.green(text);
}

export function error(text: string): string {
  return colors.error(text);
}

export function statusIcon(ok: boolean): string {
  return ok ? success(icons.ok) : error(icons.err);
}
