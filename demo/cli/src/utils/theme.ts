import gradient from "gradient-string";
import chalk from "chalk";

export const gradients = {
  cyber: gradient(["#00f5ff", "#ff00ff"]),
  neon: gradient(["#39ff14", "#00ff88", "#00f5ff"]),
  sunset: gradient(["#ff6b6b", "#ffa500", "#ffff00"]),
  matrix: gradient(["#003300", "#00ff00"]),
  frost: gradient(["#a8edea", "#fed6e3"]),
};

export const colors = {
  cyan: chalk.hex("#00f5ff"),
  magenta: chalk.hex("#ff00ff"),
  neonGreen: chalk.hex("#39ff14"),
  orange: chalk.hex("#ffa500"),
  dim: chalk.dim,
  bold: chalk.bold,
  white: chalk.white,
};

export const icons = {
  config: "[-]",
  host: "[+]",
  pkg: "[>]",
  scan: "[o]",
  run: ">>",
  test: "[~]",
  db: "[=]",
  clean: "[x]",
  ok: "[-]",
  err: "[!]",
  pending: "[ ]",
  arrow: ">",
  line: "-",
  dot: ".",
  bar: "|",
  corner: "+",
};

export const frames = {
  top: (width: number) => `+${"-".repeat(width - 2)}+`,
  bottom: (width: number) => `+${"-".repeat(width - 2)}+`,
  side: "|",
  empty: (width: number) => `|${" ".repeat(width - 2)}|`,
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
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function header(text: string): string {
  const styled = gradients.cyber(text);
  return box(styled);
}

export function divider(width = 48): string {
  return colors.dim("-".repeat(width));
}

export function label(text: string): string {
  return colors.cyan(text);
}

export function value(text: string): string {
  return colors.white(text);
}

export function success(text: string): string {
  return colors.neonGreen(text);
}

export function error(text: string): string {
  return chalk.red(text);
}

export function statusIcon(ok: boolean): string {
  return ok ? success(icons.ok) : error(icons.err);
}
