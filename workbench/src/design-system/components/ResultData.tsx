import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import { classNames } from "../class-names.ts";

export interface FilterOption {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
}

export interface FilterProps {
  readonly id?: string;
  readonly value: string;
  readonly defaultValue?: string;
  readonly options: readonly FilterOption[];
  readonly ariaLabel: string;
  readonly commandName: string;
  readonly featureId: string;
  readonly className?: string;
}

export function Filter({
  id,
  value,
  defaultValue,
  options,
  ariaLabel,
  commandName,
  featureId,
  className,
}: FilterProps) {
  const dispatch = useUiCommand();
  const selectRef = useRef<HTMLSelectElement>(null);

  useLayoutEffect(() => {
    if (defaultValue === undefined) return;
    for (const option of selectRef.current?.options ?? []) {
      option.defaultSelected = option.value === defaultValue;
    }
  }, [defaultValue]);

  return (
    <select
      ref={selectRef}
      id={id}
      className={classNames(className, "oat-input", "oat-input--compact")}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        void dispatch({
          name: commandName,
          featureId,
          payload: { value: event.currentTarget.value },
        });
      }}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface ChartFrameProps {
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
}

export function ChartFrame({
  id,
  children,
  className,
  label,
}: ChartFrameProps) {
  return (
    <div
      id={id}
      className={classNames("oat-chart-frame", className)}
      aria-label={label}
    >
      {children}
    </div>
  );
}
