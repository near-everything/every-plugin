import type { ReactNode } from "react";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return Bun.markdown.react(content, {
    h1: ({ children }: { children: ReactNode }) => (
      <h1 className="text-3xl font-bold mb-6 pb-2 border-b border-border/50">
        {children}
      </h1>
    ),
    h2: ({ children }: { children: ReactNode }) => (
      <h2 className="text-2xl font-semibold mt-10 mb-4">{children}</h2>
    ),
    h3: ({ children }: { children: ReactNode }) => (
      <h3 className="text-xl font-semibold mt-8 mb-3">{children}</h3>
    ),
    h4: ({ children }: { children: ReactNode }) => (
      <h4 className="text-lg font-medium mt-6 mb-2">{children}</h4>
    ),
    p: ({ children }: { children: ReactNode }) => (
      <p className="mb-4 leading-7 text-muted-foreground">{children}</p>
    ),
    a: ({ children, href }: { children: ReactNode; href?: string }) => (
      <a
        href={href}
        className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      >
        {children}
      </a>
    ),
    ul: ({ children }: { children: ReactNode }) => (
      <ul className="mb-4 ml-6 list-disc space-y-2">{children}</ul>
    ),
    ol: ({ children }: { children: ReactNode }) => (
      <ol className="mb-4 ml-6 list-decimal space-y-2">{children}</ol>
    ),
    li: ({ children }: { children: ReactNode }) => (
      <li className="text-muted-foreground leading-7">{children}</li>
    ),
    blockquote: ({ children }: { children: ReactNode }) => (
      <blockquote className="border-l-4 border-primary/50 pl-4 my-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    code: ({
      children,
      className,
    }: { children: ReactNode; className?: string }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        );
      }
      return <code className={className}>{children}</code>;
    },
    pre: ({ children }: { children: ReactNode }) => (
      <pre className="bg-muted/50 border border-border/50 p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono">
        {children}
      </pre>
    ),
    table: ({ children }: { children: ReactNode }) => (
      <div className="my-6 overflow-x-auto">
        <table className="w-full border-collapse border border-border/50 text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: { children: ReactNode }) => (
      <thead className="bg-muted/50">{children}</thead>
    ),
    tbody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
    tr: ({ children }: { children: ReactNode }) => (
      <tr className="border-b border-border/50">{children}</tr>
    ),
    th: ({ children }: { children: ReactNode }) => (
      <th className="px-4 py-2 text-left font-semibold border-r border-border/50 last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }: { children: ReactNode }) => (
      <td className="px-4 py-2 border-r border-border/50 last:border-r-0 text-muted-foreground">
        {children}
      </td>
    ),
    hr: () => <hr className="my-8 border-border/50" />,
    strong: ({ children }: { children: ReactNode }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }: { children: ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    del: ({ children }: { children: ReactNode }) => (
      <del className="line-through text-muted-foreground/70">{children}</del>
    ),
  });
}
