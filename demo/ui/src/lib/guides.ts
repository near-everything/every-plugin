import moltbotBosGuide from "../content/guides/moltbot-bos-guide.md" with { type: "text" };

const guides: Record<string, string> = {
  "moltbot-bos-guide": moltbotBosGuide,
};

export function getGuide(slug: string): string | null {
  return guides[slug] ?? null;
}

export function isGuide(slug: string): boolean {
  return slug in guides;
}

export function getGuideMetadata(slug: string) {
  const content = getGuide(slug);
  if (!content) return null;

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : slug;

  const descriptionMatch = content.match(/^#\s+.+\n\n(.+?)(?:\n\n|$)/m);
  const description = descriptionMatch
    ? descriptionMatch[1].slice(0, 160)
    : `Guide for ${slug}`;

  return { title, description };
}
