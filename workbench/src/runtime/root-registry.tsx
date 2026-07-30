import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppProviders } from "../app/AppProviders.tsx";
import { ErrorBoundary } from "../app/ErrorBoundary.tsx";
import {
  normalizeError,
  type RootErrorKind,
  type RootErrorReporter,
} from "./error-reporting.ts";
import { CommandBus } from "./ui-command.ts";

export interface MountReactRootOptions {
  readonly id: string;
  readonly container: Element;
  readonly children: ReactNode;
  readonly commandBus: CommandBus;
  readonly reportError: RootErrorReporter;
  readonly restoreFocusTo?: HTMLElement | null;
}

export interface ReactRootHandle {
  readonly id: string;
  readonly registerCleanup: (cleanup: () => void) => () => void;
  readonly unmount: () => void;
}

interface RegisteredRoot {
  readonly root: Root;
  readonly cleanups: Set<() => void>;
  readonly focusTarget: HTMLElement | null;
  readonly reportError: RootErrorReporter;
}

export class ReactRootRegistry {
  readonly #roots = new Map<string, RegisteredRoot>();

  mount(options: MountReactRootOptions): ReactRootHandle {
    if (this.#roots.has(options.id)) {
      throw new Error(`React root already registered: ${options.id}`);
    }
    if (options.container.childNodes.length > 0) {
      throw new Error(
        `React root ${options.id} requires an empty mount container`,
      );
    }
    const report = (
      kind: RootErrorKind,
      error: unknown,
      componentStack?: string,
    ) => {
      options.reportError({
        kind,
        rootId: options.id,
        error: normalizeError(error),
        ...(componentStack ? { componentStack } : {}),
      });
    };
    const root = createRoot(options.container, {
      identifierPrefix: `oat-${options.id}-`,
      onCaughtError: (error, info) => {
        report("caught", error, info.componentStack);
      },
      onRecoverableError: (error, info) => {
        report("recoverable", error, info.componentStack);
      },
      onUncaughtError: (error, info) => {
        report("uncaught", error, info.componentStack);
      },
    });
    const activeElement = options.container.ownerDocument.activeElement;
    const defaultFocusTarget =
      activeElement instanceof HTMLElement &&
      activeElement !== options.container.ownerDocument.body &&
      !options.container.contains(activeElement)
        ? activeElement
        : null;
    const registered: RegisteredRoot = {
      root,
      cleanups: new Set(),
      focusTarget:
        options.restoreFocusTo === undefined
          ? defaultFocusTarget
          : options.restoreFocusTo,
      reportError: options.reportError,
    };
    this.#roots.set(options.id, registered);
    root.render(
      <AppProviders
        commandBus={options.commandBus}
        reportError={options.reportError}
        rootId={options.id}
      >
        <ErrorBoundary>{options.children}</ErrorBoundary>
      </AppProviders>,
    );
    return {
      id: options.id,
      registerCleanup: (cleanup) => {
        if (!this.#roots.has(options.id)) {
          throw new Error(`React root has been unmounted: ${options.id}`);
        }
        registered.cleanups.add(cleanup);
        return () => registered.cleanups.delete(cleanup);
      },
      unmount: () => {
        this.unmount(options.id);
      },
    };
  }

  unmount(id: string): void {
    const registered = this.#roots.get(id);
    if (!registered) return;
    this.#roots.delete(id);
    try {
      registered.root.unmount();
    } catch (error) {
      registered.reportError({
        kind: "cleanup",
        rootId: id,
        error: normalizeError(error),
      });
    }
    for (const cleanup of [...registered.cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        registered.reportError({
          kind: "cleanup",
          rootId: id,
          error: normalizeError(error),
        });
      }
    }
    registered.cleanups.clear();
    if (
      registered.focusTarget &&
      registered.focusTarget.ownerDocument.contains(registered.focusTarget)
    ) {
      registered.focusTarget.focus({ preventScroll: true });
    }
  }

  unmountAll(): void {
    for (const id of [...this.#roots.keys()].reverse()) this.unmount(id);
  }

  has(id: string): boolean {
    return this.#roots.has(id);
  }

  size(): number {
    return this.#roots.size;
  }
}

export const reactRootRegistry = new ReactRootRegistry();
