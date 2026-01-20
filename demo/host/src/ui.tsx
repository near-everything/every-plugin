import type { ErrorInfo } from "react";
import { Component, type CSSProperties, type FC, type ReactNode } from "react";

export interface AppStateViewProps {
  kind: "loading" | "error" | "notFound";
  message?: string;
  submessage?: string;
  onRetry?: () => void;
  onNavigateHome?: () => void;
  errorDetails?: string;
}

const pageStyle: CSSProperties = {
  display: "flex",
  height: "100%",
  width: "100%",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(1rem, 4vw, 2rem)",
  overflow: "hidden",
};

const contentStyle: CSSProperties = {
  maxWidth: "24rem",
  width: "100%",
  textAlign: "center",
};

const spinnerStyle: CSSProperties = {
  width: "clamp(2.5rem, 8vw, 3rem)",
  height: "clamp(2.5rem, 8vw, 3rem)",
  borderRadius: "50%",
  border: "4px solid #e5e7eb",
  borderTopColor: "#171717",
  animation: "spin 1s linear infinite",
};

const emojiStyle: CSSProperties = {
  fontSize: "clamp(3rem, 10vw, 4rem)",
  marginBottom: "clamp(1rem, 3vw, 1.5rem)",
  lineHeight: 1,
};

const headingStyle: CSSProperties = {
  fontSize: "clamp(1.25rem, 4vw, 1.5rem)",
  fontWeight: 600,
  marginBottom: "clamp(0.5rem, 2vw, 1rem)",
  margin: 0,
};

const messageStyle: CSSProperties = {
  marginBottom: "clamp(1rem, 3vw, 1.5rem)",
  marginTop: 0,
  color: "#666",
  lineHeight: 1.5,
  fontSize: "clamp(0.875rem, 2.5vw, 1rem)",
};

const detailsStyle: CSSProperties = {
  marginBottom: "clamp(1rem, 3vw, 1.5rem)",
  padding: "clamp(0.75rem, 2vw, 1rem)",
  border: "1px solid #e5e5e5",
  borderRadius: "0.5rem",
  textAlign: "left",
};

const buttonContainerStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  justifyContent: "center",
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  padding: "clamp(0.5rem, 1.5vw, 0.625rem) clamp(1rem, 3vw, 1.5rem)",
  borderRadius: "0.5rem",
  fontWeight: 500,
  fontSize: "clamp(0.875rem, 2.5vw, 1rem)",
  cursor: "pointer",
  border: "none",
  backgroundColor: "#171717",
  color: "#fff",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "clamp(0.5rem, 1.5vw, 0.625rem) clamp(1rem, 3vw, 1.5rem)",
  borderRadius: "0.5rem",
  fontWeight: 500,
  fontSize: "clamp(0.875rem, 2.5vw, 1rem)",
  cursor: "pointer",
  border: "1px solid #e5e5e5",
  backgroundColor: "transparent",
};

export const Spinner: FC = () => <div style={spinnerStyle} />;

export const Button: FC<{
  variant?: "primary" | "secondary";
  onClick: () => void;
  children: ReactNode;
}> = ({ variant = "primary", onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={variant === "primary" ? primaryButtonStyle : secondaryButtonStyle}
  >
    {children}
  </button>
);

export const AppStateView: FC<AppStateViewProps> = ({
  kind,
  message,
  submessage,
  onRetry,
  onNavigateHome,
  errorDetails,
}) => {
  return (
    <div style={pageStyle}>
      <style>
        {`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
          @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        `}
      </style>

      <div style={contentStyle}>
        {kind === "error" && <div style={emojiStyle}>⚠️</div>}
        {kind === "notFound" && <div style={emojiStyle}>🔍</div>}

        {(kind === "error" || kind === "notFound") && (
          <>
            <h1 style={headingStyle}>
              {kind === "error" && (message || "Something went wrong")}
              {kind === "notFound" && (message || "Page Not Found")}
            </h1>
            <p style={messageStyle}>
              {kind === "error" &&
                (submessage ||
                  "The application encountered an unexpected error.")}
              {kind === "notFound" &&
                (submessage ||
                  "The page you're looking for doesn't exist or has been moved.")}
            </p>
          </>
        )}

        {errorDetails && (
          <details style={detailsStyle}>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 500,
                marginBottom: "0.5rem",
              }}
            >
              Technical Details
            </summary>
            <pre
              style={{
                margin: 0,
                overflow: "auto",
                fontSize: "0.75rem",
                color: "#888",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {errorDetails}
            </pre>
          </details>
        )}

        <div style={buttonContainerStyle}>
          {kind === "error" && onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try Again
            </Button>
          )}
          {onNavigateHome && (
            <Button variant="secondary" onClick={onNavigateHome}>
              Go Home
            </Button>
          )}
          {kind === "notFound" && (
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const Loading: FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "var(--host-bg, #ffffff)",
      transition: "background-color 0.2s ease",
    }}
  />
);

// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
export const Error: FC<{
  message?: string;
  submessage?: string;
  onRetry?: () => void;
  errorDetails?: string;
}> = ({
  message = "Something went wrong",
  submessage = "The application encountered an unexpected error.",
  onRetry,
  errorDetails,
}) => (
  <div style={contentStyle}>
    <div style={emojiStyle}>⚠️</div>
    <h1 style={headingStyle}>{message}</h1>
    <p style={messageStyle}>{submessage}</p>

    {errorDetails && (
      <details style={detailsStyle}>
        <summary
          style={{ cursor: "pointer", fontWeight: 500, marginBottom: "0.5rem" }}
        >
          Technical Details
        </summary>
        <pre
          style={{
            margin: 0,
            overflow: "auto",
            fontSize: "0.75rem",
            color: "#888",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {errorDetails}
        </pre>
      </details>
    )}

    <div style={buttonContainerStyle}>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  </div>
);

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isNetworkError =
        this.state.error?.message?.includes("fetch") ||
        this.state.error?.message?.includes("network") ||
        this.state.error?.message?.includes("Failed to load");

      return (
        <div style={pageStyle}>
          <Error
            message={
              isNetworkError ? "Connection Error" : "Something went wrong"
            }
            submessage={
              isNetworkError
                ? "Unable to load the remote application. Please check your connection and try again."
                : "The application encountered an unexpected error."
            }
            onRetry={this.handleRetry}
            errorDetails={this.state.error?.message}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppStateView;
