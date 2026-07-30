import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../app/AppProviders.tsx";
import { Button } from "../design-system/components/Button.tsx";
import { TextField } from "../design-system/components/Field.tsx";
import type { RootErrorReporter } from "../runtime/error-reporting.ts";
import type { AnyUiCommand } from "../runtime/ui-command.ts";
import { CommandBus } from "../runtime/ui-command.ts";

const reportError: RootErrorReporter = vi.fn();

function renderWithRuntime(children: ReactNode, commandBus = new CommandBus()) {
  return {
    commandBus,
    ...render(
      <AppProviders
        commandBus={commandBus}
        reportError={reportError}
        rootId="component-test"
      >
        {children}
      </AppProviders>,
    ),
  };
}

describe("React design-system primitives", () => {
  it("dispatches a typed command without exposing the DOM event", async () => {
    const commandBus = new CommandBus();
    const received: AnyUiCommand[] = [];
    commandBus.subscribe("catalog.run", (command) => {
      received.push(command);
    });
    renderWithRuntime(
      <Button
        label="Run"
        variant="primary"
        command={{ name: "catalog.run", payload: { jobId: "job-1" } }}
      />,
      commandBus,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(received).toEqual([
        { name: "catalog.run", payload: { jobId: "job-1" } },
      ]);
    });
  });

  it("maps busy and disabled state to the native button contract", () => {
    renderWithRuntime(
      <Button
        label="Busy"
        busy
        command={{ name: "catalog.run", payload: undefined }}
      />,
    );
    const button = screen.getByRole("button", { name: "Busy" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.classList.contains("busy")).toBe(true);
  });

  it("emits field values through a command factory", async () => {
    const commandBus = new CommandBus();
    const handler = vi.fn();
    commandBus.subscribe("catalog.field.change", handler);
    renderWithRuntime(
      <TextField
        id="test-name"
        label="Name"
        value="OpenAir"
        command={(value) => ({
          name: "catalog.field.change",
          payload: { value },
        })}
      />,
      commandBus,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "OpenAirTwin" },
    });
    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith({
        name: "catalog.field.change",
        payload: { value: "OpenAirTwin" },
      });
    });
  });
});
