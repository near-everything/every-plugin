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
import { File, Folder, Files } from "fumadocs-ui/components/files";
import { LLMCopyButton, ViewOptions } from "@/components/page-actions";

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return { ...data, slugs };
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
      page: {
        url: page.url,
        path: page.path,
      },
    };
  });

const clientLoader = createClientLoader(docs.doc, {
  id: "docs",
  component({ toc, frontmatter, default: MDX }) {
    const data = Route.useLoaderData();
    const owner = "near-everything";
    const repo = "run";
    const rawMarkdownUrl = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main/apps/docs/content/docs/${data.page.path}`;
    
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <div className="flex flex-row gap-2 items-center border-b pt-2 pb-6">
          <LLMCopyButton markdownUrl={rawMarkdownUrl} />
          <ViewOptions
            markdownUrl={rawMarkdownUrl}
            githubUrl={`https://github.com/${owner}/${repo}/blob/dev/apps/docs/content/docs/${data.page.path}`}
          />
        </div>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX
            components={{
              ...defaultMdxComponents,
              Mermaid,
              File,
              Folder,
              Files,
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
