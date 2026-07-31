export const API_TIMEOUTS: Readonly<{
  metadata: number;
  action: number;
  solver: number;
}>;

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    options?: {
      kind?: "cancelled" | "timeout" | "offline" | "server" | "request";
      status?: number | null;
      cause?: unknown;
    },
  );
  readonly kind: "cancelled" | "timeout" | "offline" | "server" | "request";
  readonly status: number | null;
}

export interface RequestFailureState {
  readonly kind: ApiRequestError["kind"];
  readonly status: "Cancelled" | "Timed Out" | "Offline" | "Server Error" | "Failed";
  readonly label: string;
  readonly message: string;
}

export function requestFailureState(error: unknown): RequestFailureState;

export function requestJson<T = Record<string, unknown>>(
  url: string,
  options?: RequestJsonOptions,
): Promise<T>;
