import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
    supports: () => false,
  } as unknown as typeof CSS;
} else if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = (value: string) =>
    value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

afterEach(() => {
  cleanup();
});
