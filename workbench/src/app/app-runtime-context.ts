import { createContext } from "react";

import type { RootErrorReporter } from "../runtime/error-reporting.ts";
import type { CommandDispatcher } from "../runtime/ui-command.ts";

export interface AppRuntimeValue {
  readonly dispatch: CommandDispatcher;
  readonly reportError: RootErrorReporter;
}

export const AppRuntimeContext = createContext<AppRuntimeValue | null>(null);
