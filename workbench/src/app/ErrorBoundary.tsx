import { Component, type ErrorInfo, type ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

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
    <section className="oat-bootstrap-error" role="alert">
      <Card padding={3} elevation="med">
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center" gap={2}>
            <Text type="label" weight="semibold">
              Unable to render this panel
            </Text>
            <Badge label="Error" variant="error" />
          </HStack>
          <Text type="supporting" color="secondary">
            {error.message}
          </Text>
        </VStack>
      </Card>
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
