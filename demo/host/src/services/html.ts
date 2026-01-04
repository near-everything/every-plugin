import type { HeadData, HeadLink, HeadMeta, HeadScript } from "../types";
import type { RuntimeConfig } from "./config";

export type { HeadData, HeadLink, HeadMeta, HeadScript };

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHeadToString(head: HeadData): string {
  const parts: string[] = [];

  for (const meta of head.meta) {
    if (!meta) continue;
    if ("title" in meta && meta.title) {
      parts.push(`<title>${escapeHtml(String(meta.title))}</title>`);
    } else {
      const attrs = Object.entries(meta)
        .filter(([k, v]) => k !== "children" && v !== undefined)
        .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
        .join(" ");
      if (attrs) parts.push(`<meta ${attrs} />`);
    }
  }

  for (const link of head.links) {
    if (!link) continue;
    const attrs = Object.entries(link)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
      .join(" ");
    if (attrs) parts.push(`<link ${attrs} />`);
  }

  for (const script of head.scripts) {
    if (!script) continue;
    const { children, ...rest } = script;
    const attrs = Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => (typeof v === "boolean" ? (v ? k : "") : `${k}="${escapeHtml(String(v))}"`))
      .filter(Boolean)
      .join(" ");
    if (children) {
      parts.push(`<script ${attrs}>${children}</script>`);
    } else if (attrs) {
      parts.push(`<script ${attrs}></script>`);
    }
  }

  return parts.join("\n    ");
}

export function createWindowConfig(config: RuntimeConfig) {
  return {
    env: config.env,
    title: config.title,
    hostUrl: config.hostUrl,
    ui: config.ui,
    apiBase: "/api",
    rpcBase: "/api/rpc",
  };
}

export function injectRuntimeConfig(html: string, config: RuntimeConfig): string {
  const clientConfig = createWindowConfig(config);
  const configScript = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(clientConfig)};</script>`;
  const preloadLink = `<link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" crossorigin="anonymous" />`;

  return html
    .replace("<!--__HEAD_CONTENT__-->", "")
    .replace("<!--__RUNTIME_CONFIG__-->", configScript)
    .replace("<!--__REMOTE_PRELOAD__-->", preloadLink);
}

export function injectHeadAndConfig(
  html: string,
  config: RuntimeConfig,
  headHtml: string
): string {
  const clientConfig = createWindowConfig(config);
  const configScript = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(clientConfig)};</script>`;
  const preloadLink = `<link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" crossorigin="anonymous" />`;

  return html
    .replace("<!--__HEAD_CONTENT__-->", headHtml)
    .replace("<!--__RUNTIME_CONFIG__-->", configScript)
    .replace("<!--__REMOTE_PRELOAD__-->", preloadLink);
}
