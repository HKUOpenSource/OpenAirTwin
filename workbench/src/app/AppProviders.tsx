import { useCallback, useMemo, type ReactNode } from "react";

import type { RootErrorReporter } from "../runtime/error-reporting.ts";
import { normalizeError } from "../runtime/error-reporting.ts";
import type { AnyUiCommand } from "../runtime/ui-command.ts";
import { CommandBus } from "../runtime/ui-command.ts";
import {
  AppRuntimeContext,
  type AppRuntimeValue,
} from "./app-runtime-context.ts";

export interface AppProvidersProps {
  readonly children: ReactNode;
  readonly commandBus: CommandBus;
  readonly reportError: RootErrorReporter;
  readonly rootId: string;
}

export function AppProviders({
  children,
  commandBus,
  reportError,
  rootId,
}: AppProvidersProps) {
  const dispatch = useCallback(
    async (command: AnyUiCommand) => {
      try {
        await commandBus.dispatch(command);
      } catch (error) {
        reportError({ kind: "caught", rootId, error: normalizeError(error) });
      }
    },
    [commandBus, reportError, rootId],
  );
  const value = useMemo<AppRuntimeValue>(
    () => ({ dispatch, reportError }),
    [dispatch, reportError],
  );
  return (
    <AppRuntimeContext.Provider value={value}>
      {children}
    </AppRuntimeContext.Provider>
  );
}
