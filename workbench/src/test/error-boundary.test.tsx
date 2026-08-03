import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../app/ErrorBoundary.tsx";

class ControlledFailure extends Component<{
  readonly fail: boolean;
  readonly children: ReactNode;
}> {
  override render() {
    if (this.props.fail) throw new Error("Fixture render failed");
    return this.props.children;
  }
}

describe("ErrorBoundary", () => {
  it("clears a captured error when its reset key changes", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const view = render(
      <ErrorBoundary resetKey="before">
        <ControlledFailure fail>Recovered content</ControlledFailure>
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Fixture render failed",
    );

    view.rerender(
      <ErrorBoundary resetKey="after">
        <ControlledFailure fail={false}>Recovered content</ControlledFailure>
      </ErrorBoundary>,
    );

    expect(await screen.findByText("Recovered content")).not.toBeNull();
    consoleError.mockRestore();
  });
});
