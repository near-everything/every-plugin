import type { AnyRouter } from "@tanstack/react-router";
import type { HeadData, HeadLink, HeadMeta, HeadScript } from "./types";

export function getMetaKey(meta: HeadMeta): string {
  if (!meta) return "null";
  if ("title" in meta) return "title";
  if ("charSet" in meta) return "charSet";
  if ("name" in meta) return `name:${(meta as { name: string }).name}`;
  if ("property" in meta) return `property:${(meta as { property: string }).property}`;
  if ("httpEquiv" in meta) return `httpEquiv:${(meta as { httpEquiv: string }).httpEquiv}`;
  return JSON.stringify(meta);
}

export function getLinkKey(link: HeadLink): string {
  const rel = (link as { rel?: string }).rel ?? "";
  const href = (link as { href?: string }).href ?? "";
  return `${rel}:${href}`;
}

export function getScriptKey(script: HeadScript): string {
  if (!script) return "null";
  if ("src" in script && script.src) return `src:${script.src}`;
  if ("children" in script && script.children)
    return `children:${typeof script.children === "string" ? script.children : JSON.stringify(script.children)}`;
  return JSON.stringify(script);
}

export async function collectHeadData(router: AnyRouter): Promise<HeadData> {
  await router.load();

  const metaMap = new Map<string, HeadMeta>();
  const linkMap = new Map<string, HeadLink>();
  const scriptMap = new Map<string, HeadScript>();

  for (const match of router.state.matches) {
    const headFn = match.route?.options?.head;
    if (!headFn) continue;

    try {
      const headResult = await headFn({
        loaderData: match.loaderData,
        matches: router.state.matches,
        match,
        params: match.params,
      } as Parameters<typeof headFn>[0]);

      if (headResult?.meta) {
        for (const meta of headResult.meta) {
          metaMap.set(getMetaKey(meta), meta);
        }
      }
      if (headResult?.links) {
        for (const link of headResult.links) {
          linkMap.set(getLinkKey(link), link);
        }
      }
      if (headResult?.scripts) {
        for (const script of headResult.scripts) {
          scriptMap.set(getScriptKey(script), script);
        }
      }
    } catch (error) {
      console.warn(`[collectHeadData] head() failed for ${match.routeId}:`, error);
    }
  }

  return {
    meta: [...metaMap.values()],
    links: [...linkMap.values()],
    scripts: [...scriptMap.values()],
  };
}
