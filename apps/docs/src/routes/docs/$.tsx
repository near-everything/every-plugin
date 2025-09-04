import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { PageTree } from "fumadocs-core/server";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import { useMemo } from "react";
import { Mermaid } from "@/components/mermaid";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { docs } from "../../../source.generated";
import { File, Folder, Files } from 'fumadocs-ui/components/files';

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return { ...data, slugs };
  },
  head: ({ loaderData }) => {
    const slugs = loaderData?.slugs ?? [];
    const page = source.getPage(slugs);
    const frontmatter = page?.data._exports?.frontmatter as { title?: string; description?: string } | undefined;
    
    const title = frontmatter?.title 
      ? `${frontmatter.title} | every plugin docs`
      : "every plugin docs";
    
    const description = frontmatter?.description || 
      "Documentation for every plugin - a composable remote plugin runtime built with Effect.TS and Module Federation.";
    
    const url = `https://plugin.everything.dev/docs/${slugs.join("/")}`;
    
    return {
      title,
      meta: [
        {
          name: "description",
          content: description,
        },
        // Open Graph
        {
          property: "og:title",
          content: title,
        },
        {
          property: "og:description",
          content: description,
        },
        {
          property: "og:url",
          content: url,
        },
        {
          property: "og:type",
          content: "article",
        },
        {
          property: "og:image",
          content: "https://plugin.everything.dev/metadata.png",
        },
        // Twitter
        {
          property: "twitter:card",
          content: "summary_large_image",
        },
        {
          property: "twitter:title",
          content: title,
        },
        {
          property: "twitter:description",
          content: description,
        },
        {
          property: "twitter:url",
          content: url,
        },
        {
          property: "twitter:image",
          content: "https://plugin.everything.dev/metadata.png",
        },
      ],
      links: [
        {
          rel: "canonical",
          href: url,
        },
      ],
    };
  },
});

const loader = createServerFn({
  method: "GET",
})
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      tree: source.pageTree as object,
      path: page.path,
    };
  });

const clientLoader = createClientLoader(docs.doc, {
  id: "docs",
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={{
              ...defaultMdxComponents,
              Mermaid,
              File,
              Folder,
              Files
            }}
          />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const data = Route.useLoaderData();
  const Content = clientLoader.getComponent(data.path);
  const tree = useMemo(
    () => transformPageTree(data.tree as PageTree.Folder),
    [data.tree]
  );

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
      <Content />
    </DocsLayout>
  );
}

function transformPageTree(tree: PageTree.Folder): PageTree.Folder {
  function transform<T extends PageTree.Item | PageTree.Separator>(item: T) {
    if (typeof item.icon !== "string") return item;

    return {
      ...item,
      icon: (
        <span
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fumadocs
          dangerouslySetInnerHTML={{
            __html: item.icon,
          }}
        />
      ),
    };
  }

  return {
    ...tree,
    index: tree.index ? transform(tree.index) : undefined,
    children: tree.children.map((item) => {
      if (item.type === "folder") return transformPageTree(item);
      return transform(item);
    }),
  };
}
