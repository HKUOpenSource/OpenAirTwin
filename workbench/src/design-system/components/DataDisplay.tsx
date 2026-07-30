import type { ReactNode } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { AnyUiCommand } from "../../runtime/ui-command.ts";
import { classNames } from "../class-names.ts";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "busy";

export interface BadgeProps {
  readonly label: ReactNode;
  readonly tone?: BadgeTone;
  readonly live?: "polite" | "assertive";
  readonly busy?: boolean;
}

export function Badge({
  label,
  tone = "neutral",
  live,
  busy = false,
}: BadgeProps) {
  return (
    <span
      className={classNames(
        "oat-badge",
        tone !== "neutral" && `oat-badge--${tone}`,
      )}
      aria-live={live}
      aria-busy={busy || undefined}
    >
      {label}
    </span>
  );
}

export interface MetricItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly valueId?: string;
  readonly valueClassName?: string;
}

export interface MetricGridProps {
  readonly items: readonly MetricItem[];
  readonly className?: string;
}

export function MetricGrid({ items, className }: MetricGridProps) {
  return (
    <div className={classNames("oat-metric-grid", className)}>
      {items.map((item) => (
        <div className="oat-list-card" key={item.id}>
          <b>{item.label}</b>
          <span id={item.valueId} className={item.valueClassName}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ListCardProps {
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly detail?: ReactNode;
  readonly selected?: boolean;
  readonly command?: AnyUiCommand;
}

export function ListCard({
  title,
  meta,
  detail,
  selected = false,
  command,
}: ListCardProps) {
  const dispatch = useUiCommand();
  const content = (
    <>
      <span>{title}</span>
      {meta ? <span>{meta}</span> : null}
      {detail ? <small>{detail}</small> : null}
    </>
  );
  if (!command) return <div className="oat-list-card">{content}</div>;
  return (
    <button
      className={classNames(
        "oat-list-card",
        "oat-list-card--interactive",
        selected && "selected",
      )}
      type="button"
      aria-selected={selected || undefined}
      onClick={() => {
        void dispatch(command);
      }}
    >
      {content}
    </button>
  );
}

export interface EmptyStateProps {
  readonly message: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <>
      <p className={classNames("oat-empty-state", className)}>{message}</p>
      {action}
    </>
  );
}
