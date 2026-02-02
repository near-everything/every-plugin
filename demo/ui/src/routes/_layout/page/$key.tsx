import { createFileRoute } from "@tanstack/react-router";
import { MarkdownRenderer } from "../../../components/markdown-renderer";
import { getGuide, getGuideMetadata, isGuide } from "../../../lib/guides";

function generateOgImageSvg(keyId: string): string {
  const escapedKey = keyId.length > 40 ? `${keyId.slice(0, 37)}...` : keyId;
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#171717"/>
    <text x="600" y="315" font-family="monospace" font-size="48" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${escapedKey}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const Route = createFileRoute("/_layout/page/$key")({
  ssr: true,
  head: ({ params }) => {
    const keyName = params.key;
    const metadata = getGuideMetadata(keyName);

    const title = metadata ? `${metadata.title} | everything.dev` : `${keyName} | demo.everything`;
    const description = metadata
      ? metadata.description
      : `This is a sample page for "${keyName}" that is publicly visible without authentication.`;
    const ogImage = generateOgImageSvg(metadata?.title ?? keyName);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:image", content: ogImage },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: PublicKeyPage,
});

function PublicKeyPage() {
  const { key } = Route.useParams();
  const guideContent = getGuide(key);

  if (guideContent) {
    return (
      <article className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        <MarkdownRenderer content={guideContent} />
      </article>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
      <div className="space-y-8">
        <div className="pb-4 border-b border-border/50">
          <h1 className="text-lg font-mono">Public Page: {key}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This is a sample page that is publicly visible without authentication.
          </p>
        </div>

        <div className="p-6 bg-muted/20 rounded-lg border border-border/50">
          <h3 className="text-sm font-mono mb-2">Key Parameter</h3>
          <pre className="text-xs font-mono text-muted-foreground overflow-auto bg-background p-3 rounded border">
            {JSON.stringify({ key }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
