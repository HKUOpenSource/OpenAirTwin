import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  requestFailureState,
  requestJson,
} from "../../../backend/static/js/api.js";

function abortReason(signal: AbortSignal | null | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Request cancelled", "AbortError");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("maps request failures to stable UI states", () => {
    expect(
      requestFailureState(
        new ApiRequestError("Deadline reached", { kind: "timeout" }),
      ),
    ).toEqual({
      kind: "timeout",
      status: "Timed Out",
      label: "Request timed out",
      message: "Deadline reached",
    });
    expect(requestFailureState(new Error("Unexpected"))).toMatchObject({
      kind: "request",
      status: "Failed",
    });
  });

  it("classifies an internal deadline as a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              reject(abortReason(options.signal));
            });
          }),
      ),
    );

    const request = requestJson("/api/test", { timeoutMs: 25 });
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("keeps the deadline active while reading the response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              options.signal?.addEventListener("abort", () => {
                reject(abortReason(options.signal));
              });
            }),
        }),
      ),
    );

    const request = requestJson("/api/test", { timeoutMs: 25 });
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("preserves external cancellation as AbortError", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              reject(abortReason(options.signal));
            });
          }),
      ),
    );

    const request = requestJson("/api/test", { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: "AbortError",
      kind: "cancelled",
    });
  });

  it("distinguishes offline and server failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: "Solver unavailable" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson("/api/offline")).rejects.toMatchObject({
      name: "OfflineError",
      kind: "offline",
    });
    await expect(requestJson("/api/server")).rejects.toMatchObject({
      name: "ServerError",
      kind: "server",
      status: 503,
    });
  });

  it("never retries a failed POST automatically", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestJson("/api/jobs", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(
      requestJson("/api/jobs", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
