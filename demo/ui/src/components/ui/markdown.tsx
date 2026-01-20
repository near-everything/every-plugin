import { cn } from "@/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  const html = parseMarkdown(content);

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendering requires HTML injection
    <article
      className={cn(
        "prose prose-neutral dark:prose-invert max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-3xl prose-h1:mb-6",
        "prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:border-b prose-h2:border-border prose-h2:pb-2",
        "prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3",
        "prose-p:text-muted-foreground prose-p:leading-relaxed",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg",
        "prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:not-italic",
        "prose-li:text-muted-foreground",
        "prose-table:border prose-table:border-border",
        "prose-th:bg-muted prose-th:border prose-th:border-border prose-th:px-4 prose-th:py-2",
        "prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2",
        "prose-hr:border-border",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseMarkdown(md: string): string {
  let html = md;

  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  html = html.replace(/`{3}(\w*)\n([\s\S]*?)\n`{3}/gim, (_, lang, code) => {
    const escapedCode = escapeHtml(code);
    return `<pre><code class="language-${lang || 'text'}">${escapedCode}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/gim, (_, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  html = html.replace(/^\|(.+)\|$/gim, (match) => {
    return match;
  });

  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.match(/^\|(.+)\|$/)) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }

      if (line.match(/^\|[\s\-:|]+\|$/)) {
        continue;
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        processedLines.push(buildTable(tableRows));
        inTable = false;
        tableRows = [];
      }

      const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
      const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);

      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) {
            processedLines.push(buildList(listItems, listType));
          }
          inList = true;
          listType = 'ul';
          listItems = [];
        }
        listItems.push(ulMatch[1]);
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) {
            processedLines.push(buildList(listItems, listType));
          }
          inList = true;
          listType = 'ol';
          listItems = [];
        }
        listItems.push(olMatch[1]);
      } else {
        if (inList) {
          processedLines.push(buildList(listItems, listType));
          inList = false;
          listItems = [];
        }

        if (line.match(/^>\s*(.*)/)) {
          const quoteContent = line.replace(/^>\s*/, '');
          processedLines.push(`<blockquote><p>${quoteContent}</p></blockquote>`);
        } else if (line.match(/^---+$/)) {
          processedLines.push('<hr />');
        } else if (line.trim() === '') {
          processedLines.push('');
        } else if (!line.match(/^<h[1-6]>/)) {
          processedLines.push(`<p>${line}</p>`);
        } else {
          processedLines.push(line);
        }
      }
    }
  }

  if (inTable) {
    processedLines.push(buildTable(tableRows));
  }
  if (inList) {
    processedLines.push(buildList(listItems, listType));
  }

  html = processedLines.join('\n');

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/gim,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return html;
}

function buildTable(rows: string[]): string {
  if (rows.length === 0) return '';

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  const headerCells = headerRow
    .split('|')
    .filter((c) => c.trim())
    .map((c) => `<th>${c.trim()}</th>`)
    .join('');

  const bodyRows = dataRows
    .map((row) => {
      const cells = row
        .split('|')
        .filter((c) => c.trim())
        .map((c) => `<td>${c.trim()}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<div class="overflow-x-auto"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function buildList(items: string[], type: 'ul' | 'ol'): string {
  const listItems = items.map((item) => `<li>${item}</li>`).join('');
  return `<${type}>${listItems}</${type}>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
