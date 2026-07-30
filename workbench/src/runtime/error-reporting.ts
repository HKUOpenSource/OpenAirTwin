export type RootErrorKind = "caught" | "uncaught" | "recoverable" | "cleanup";

export interface RootErrorEvent {
  readonly kind: RootErrorKind;
  readonly rootId: string;
  readonly error: Error;
  readonly componentStack?: string;
}

export type RootErrorReporter = (event: RootErrorEvent) => void;

export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
