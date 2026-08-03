import type { ReactNode } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { UiCommand } from "../../runtime/ui-command.ts";

export interface CheckboxProps {
  readonly id?: string;
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly command: (checked: boolean) => UiCommand<string, unknown>;
  readonly mixed?: boolean;
  readonly disabled?: boolean;
}

export function Checkbox({
  id,
  label,
  checked,
  command,
  mixed = false,
  disabled = false,
}: CheckboxProps) {
  const dispatch = useUiCommand();
  return (
    <label className="oat-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={mixed ? "mixed" : checked}
        onChange={(event) => {
          void dispatch(command(event.currentTarget.checked));
        }}
      />
      <span>{label}</span>
    </label>
  );
}
