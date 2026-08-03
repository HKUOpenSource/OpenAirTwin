import { useContext } from "react";

import { AppRuntimeContext } from "./app-runtime-context.ts";

export function useUiCommand() {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime)
    throw new Error("useUiCommand must be used within AppProviders");
  return runtime.dispatch;
}
