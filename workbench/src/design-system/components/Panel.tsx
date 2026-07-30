import type { ReactNode } from "react";

import { classNames } from "../class-names.ts";

export interface PanelProps {
  readonly id?: string;
  readonly children: ReactNode;
  readonly hidden?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function Panel({
  id,
  children,
  hidden = false,
  ariaLabel,
  className,
}: PanelProps) {
  return (
    <section
      className={classNames("oat-panel", hidden && "hidden", className)}
      id={id}
      aria-label={ariaLabel}
      aria-hidden={hidden || undefined}
    >
      {children}
    </section>
  );
}

export interface PanelHeaderProps {
  readonly title: ReactNode;
  readonly titleId?: string;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
}

export function PanelHeader({
  title,
  titleId,
  subtitle,
  actions,
}: PanelHeaderProps) {
  return (
    <div className="oat-panel__header">
      <div>
        <h2 className="oat-panel__title" id={titleId}>
          {title}
        </h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {actions}
    </div>
  );
}

export interface ScrollRegionProps {
  readonly id?: string;
  readonly children: ReactNode;
  readonly label?: string;
  readonly tabIndex?: 0 | -1;
  readonly className?: string;
}

export function ScrollRegion({
  id,
  children,
  label,
  tabIndex,
  className,
}: ScrollRegionProps) {
  return (
    <div
      className={classNames("oat-scroll-region", className)}
      id={id}
      aria-label={label}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  );
}
