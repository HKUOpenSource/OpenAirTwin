import type { ReactNode } from "react";

import { classNames } from "../class-names.ts";

export interface IconProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly viewBox?: string;
}

export function Icon({
  children,
  className,
  viewBox = "0 0 24 24",
}: IconProps) {
  return (
    <svg
      className={classNames("oat-icon", className)}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
