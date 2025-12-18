import { loadRemote } from "@module-federation/runtime";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentType,
  type FC,
} from "react";
import { getRuntimeConfig } from "./federation";
import { ErrorBoundary, Loading } from "./ui";

interface RegistryItem {
  name: string;
  type: string;
  title: string;
  description: string;
  registryDependencies?: string[];
  files: { path: string; type: string }[];
  meta?: {
    defaultProps?: Record<string, unknown>;
  };
}

interface Registry {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryItem[];
}

const Providers = lazy(async () => {
  const config = getRuntimeConfig();
  const module = await loadRemote<{ default: FC<{ children: React.ReactNode }> }>(`${config.ui.name}/providers`);
  if (!module) throw new Error(`Failed to load ${config.ui.name}/providers`);
  return module;
});

const cardContainerStyle: CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const cardHeaderStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
  background: "#fafafa",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const cardTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

const previewContainerStyle: CSSProperties = {
  padding: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "120px",
  background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
};

const propsToggleStyle: CSSProperties = {
  fontSize: "11px",
  color: "#6b7280",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px 8px",
  borderRadius: "4px",
  border: "none",
  background: "transparent",
};

const propsContainerStyle: CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  background: "#f9fafb",
  padding: "12px 16px",
  fontSize: "11px",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: "#6b7280",
  overflow: "auto",
  maxHeight: "120px",
};

const inlineLoaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#9ca3af",
  fontSize: "12px",
};



const errorBadgeStyle: CSSProperties = {
  fontSize: "11px",
  color: "#dc2626",
  background: "#fef2f2",
  padding: "4px 8px",
  borderRadius: "4px",
};

interface ComponentCardProps {
  name: string;
  title: string;
  description: string;
  Component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  index: number;
}

const ComponentCard: FC<ComponentCardProps> = ({
  title,
  Component,
  props,
}) => {
  const [showProps, setShowProps] = useState(false);
  const hasProps = Object.keys(props).length > 0;

  return (
    <div style={cardContainerStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>{`<${title} />`}</span>
        {hasProps && (
          <button
            onClick={() => setShowProps(!showProps)}
            style={propsToggleStyle}
          >
            {showProps ? "▼" : "▶"} Props
          </button>
        )}
      </div>
      <div style={previewContainerStyle}>
        <ErrorBoundary
          fallback={<span style={errorBadgeStyle}>Failed to load</span>}
        >
          <Suspense
            fallback={
              <div style={inlineLoaderStyle}>
                <span>Loading...</span>
              </div>
            }
          >
            <Component {...props} />
          </Suspense>
        </ErrorBoundary>
      </div>
      {hasProps && showProps && (
        <div style={propsContainerStyle}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(props, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};



const pageContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  width: "100vw",
  overflow: "hidden",
  background: "#f3f4f6",
};

const scrollContainerStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "clamp(16px, 4vw, 32px)",
};

const contentWrapperStyle: CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  marginBottom: "clamp(24px, 4vw, 40px)",
};

const titleStyle: CSSProperties = {
  fontSize: "clamp(20px, 4vw, 28px)",
  fontWeight: 600,
  color: "#111827",
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: "clamp(13px, 2vw, 15px)",
  color: "#6b7280",
  marginTop: "8px",
};

const codeStyle: CSSProperties = {
  background: "#e5e7eb",
  padding: "2px 6px",
  borderRadius: "4px",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.9em",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "clamp(16px, 3vw, 24px)",
};

const createLazyComponent = (componentName: string) => {
  return lazy(async () => {
    const config = getRuntimeConfig();
    const module = await loadRemote<
      Record<string, ComponentType<Record<string, unknown>>>
    >(`${config.ui.name}/components`);
    if (!module || !module[componentName]) {
      throw new Error(
        `Component ${componentName} not found in ${config.ui.name}/components`
      );
    }
    return { default: module[componentName] };
  });
};

export const Components: FC = () => {
  const [ready, setReady] = useState(false);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [config, setConfig] = useState<ReturnType<typeof getRuntimeConfig> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setConfig(getRuntimeConfig());
  }, []);

  useEffect(() => {
    const fetchRegistry = async () => {
      if (!config) return;

      try {
        const remoteUrl = config.ui.url;
        const baseUrl = remoteUrl.replace(/\/remoteEntry\.js$/, "");
        const registryUrl = `${baseUrl}/r/registry.json`;

        const response = await fetch(registryUrl);
        if (!response.ok)
          throw new Error(`Failed to fetch registry: ${response.status}`);
        const data = await response.json();
        setRegistry(data);
      } catch (err) {
        console.error("Failed to load registry:", err);
        setRegistryError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    fetchRegistry();
  }, [config]);

  const componentEntries = useMemo(() => {
    if (!registry) return [];
    return registry.items.map((item) => ({
      name: item.name,
      title: item.title,
      description: item.description,
      Component: createLazyComponent(item.title),
      defaultProps: item.meta?.defaultProps || {},
    }));
  }, [registry]);

  const wrapperAnimation: CSSProperties = {
    opacity: ready ? 1 : 0,
    transition: "opacity 300ms ease-out",
  };

  return (
    <div style={{ ...pageContainerStyle, ...wrapperAnimation }}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <ErrorBoundary>
        <Suspense
          fallback={<Loading />}
        >
          <Providers>
            <div style={scrollContainerStyle}>
              <div style={contentWrapperStyle}>
                <header style={headerStyle}>
                  <h1 style={titleStyle}>Component Gallery</h1>
                  <p style={subtitleStyle}>
                    Remote components from{" "}
                    <code style={codeStyle}>
                      {config?.ui.name || "Loading..."}
                    </code>
                  </p>
                </header>

                {registryError && (
                  <div
                    style={{
                      ...errorBadgeStyle,
                      marginBottom: "16px",
                      padding: "12px",
                    }}
                  >
                    Failed to load registry: {registryError}
                  </div>
                )}

                {!registry && !registryError && (
                  <div style={inlineLoaderStyle}>
                    <span>Loading component registry...</span>
                  </div>
                )}

                <div style={gridStyle}>
                  {componentEntries.map((entry, index) => (
                    <ComponentCard
                      key={entry.name}
                      name={entry.name}
                      title={entry.title}
                      description={entry.description}
                      Component={entry.Component}
                      props={entry.defaultProps}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Providers>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};

export default Components;
