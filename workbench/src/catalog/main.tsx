import { CatalogApp } from "./CatalogApp.tsx";
import type { RootErrorEvent } from "../runtime/error-reporting.ts";
import { reactRootRegistry } from "../runtime/root-registry.tsx";
import { CommandBus } from "../runtime/ui-command.ts";

const rootId = "ui-catalog";
const container = document.getElementById("reactCatalogRoot");
const errorOutput = document.getElementById("reactCatalogRootError");

if (!container) throw new Error("React catalog mount is missing");

const commandBus = new CommandBus();
const reportError = (event: RootErrorEvent) => {
  if (errorOutput)
    errorOutput.textContent = `${event.kind}: ${event.error.message}`;
};
const root = reactRootRegistry.mount({
  id: rootId,
  container,
  children: <CatalogApp commandBus={commandBus} />,
  commandBus,
  reportError,
});
const dispose = () => {
  root.unmount();
  commandBus.dispose();
};

window.addEventListener("pagehide", dispose, { once: true });
root.registerCleanup(() => {
  window.removeEventListener("pagehide", dispose);
});
container.setAttribute("data-react-ready", "true");
