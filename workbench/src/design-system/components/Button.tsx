import type { ReactNode } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { AnyUiCommand } from "../../runtime/ui-command.ts";
import { classNames } from "../class-names.ts";

export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "default" | "compact";

export interface ButtonProps {
  readonly id?: string;
  readonly label: ReactNode;
  readonly command: AnyUiCommand;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly block?: boolean;
  readonly toolbar?: boolean;
  readonly className?: string;
}

export function Button({
  id,
  label,
  command,
  variant = "default",
  size = "default",
  busy = false,
  disabled = false,
  pressed,
  block = false,
  toolbar = false,
  className,
}: ButtonProps) {
  const dispatch = useUiCommand();
  return (
    <button
      className={classNames(
        "oat-button",
        size === "compact" && "oat-button--compact",
        variant !== "default" && `oat-button--${variant}`,
        block && "oat-button--block",
        toolbar && "oat-button--toolbar",
        pressed && "active",
        busy && "busy",
        className,
      )}
      id={id}
      type="button"
      aria-busy={busy || undefined}
      aria-pressed={pressed}
      disabled={disabled || busy}
      onClick={() => {
        void dispatch(command);
      }}
    >
      {label}
    </button>
  );
}

export interface IconButtonProps {
  readonly id?: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly command: AnyUiCommand;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}

export function IconButton({
  id,
  label,
  icon,
  command,
  pressed,
  disabled = false,
  danger = false,
}: IconButtonProps) {
  const dispatch = useUiCommand();
  return (
    <button
      className={classNames(
        "oat-button",
        "oat-button--icon",
        danger && "oat-button--danger",
        pressed && "active",
      )}
      id={id}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => {
        void dispatch(command);
      }}
    >
      {icon}
    </button>
  );
}

export interface ButtonGroupProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly orientation?: "horizontal" | "vertical";
}

export function ButtonGroup({
  label,
  children,
  orientation = "horizontal",
}: ButtonGroupProps) {
  return (
    <div
      className="oat-button-group"
      role="group"
      aria-label={label}
      aria-orientation={orientation}
    >
      {children}
    </div>
  );
}
