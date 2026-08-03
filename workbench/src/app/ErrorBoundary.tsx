import { Component, type ErrorInfo, type ReactNode } from "react";

import { normalizeError } from "../runtime/error-reporting.ts";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode | ((error: Error) => ReactNode);
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  readonly resetKey?: string | number;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

function defaultFallback(error: Error) {
  return (
    <section className="oat-panel" role="alert">
      <div className="oat-panel__header">
        <strong className="oat-panel__title">
          Unable to render this panel
        </strong>
        <span className="oat-badge oat-badge--error">Error</span>
      </div>
      <p className="oat-empty-state">{error.message}</p>
    </section>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === "function") return fallback(error);
    return fallback ?? defaultFallback(error);
  }
}
