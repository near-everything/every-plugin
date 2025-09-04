import { useTheme } from "next-themes";
import { use, useEffect, useId, useState } from "react";

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(
  key: string,
  setPromise: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(
    cachePromise("mermaid", () => import("mermaid"))
  );

  // Define custom theme variables for better contrast with color variety
  const lightThemeVariables = {
    primaryColor: '#2563eb',
    primaryTextColor: '#ffffff',
    primaryBorderColor: '#1d4ed8',
    lineColor: '#374151',
    sectionBkgColor: '#f8fafc',
    altSectionBkgColor: '#e2e8f0',
    gridColor: '#d1d5db',
    secondaryColor: '#7c3aed',
    tertiaryColor: '#059669',
    background: '#ffffff',
    mainBkg: '#f1f5f9',
    secondBkg: '#e2e8f0',
    tertiaryBkg: '#cbd5e1',
    // Additional colors for variety
    cScale0: '#2563eb', // Blue
    cScale1: '#7c3aed', // Purple  
    cScale2: '#059669', // Green
    cScale3: '#dc2626', // Red
    cScale4: '#ea580c', // Orange
    cScale5: '#0891b2', // Cyan
    cScale6: '#be185d', // Pink
    cScale7: '#4338ca', // Indigo
  };

  const darkThemeVariables = {
    primaryColor: '#3b82f6',
    primaryTextColor: '#ffffff',
    primaryBorderColor: '#2563eb',
    lineColor: '#9ca3af',
    sectionBkgColor: '#1f2937',
    altSectionBkgColor: '#374151',
    gridColor: '#4b5563',
    secondaryColor: '#8b5cf6',
    tertiaryColor: '#10b981',
    background: '#111827',
    mainBkg: '#1f2937',
    secondBkg: '#374151',
    tertiaryBkg: '#4b5563',
    // Additional colors for variety (darker versions)
    cScale0: '#3b82f6', // Blue
    cScale1: '#8b5cf6', // Purple
    cScale2: '#10b981', // Green  
    cScale3: '#ef4444', // Red
    cScale4: '#f97316', // Orange
    cScale5: '#06b6d4', // Cyan
    cScale6: '#ec4899', // Pink
    cScale7: '#6366f1', // Indigo
  };

  const themeVariables = resolvedTheme === 'dark' ? darkThemeVariables : lightThemeVariables;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    fontFamily: "inherit",
    theme: "base",
    themeVariables,
    themeCSS: `
      .node rect, .node circle, .node ellipse, .node polygon {
        stroke-width: 2px;
      }
      .edgePath .path {
        stroke-width: 2px;
      }
      .flowchart-link {
        stroke-width: 2px;
      }
      .marker {
        fill: ${themeVariables.lineColor};
      }
      .node .label {
        color: ${resolvedTheme === 'dark' ? '#ffffff' : '#1f2937'};
      }
      .edgeLabel {
        background-color: ${themeVariables.background};
        color: ${resolvedTheme === 'dark' ? '#ffffff' : '#1f2937'};
      }
      margin: 1.5rem auto 0;
    `,
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll("\\n", "\n"));
    })
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: fumadocs
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
