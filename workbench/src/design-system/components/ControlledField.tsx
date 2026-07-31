import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import {
  controlCommitCommand,
  controlDraftCommand,
  type ControlFieldViewModel,
} from "../../features/controls/contracts.ts";
import { classNames } from "../class-names.ts";

export interface ControlledFieldProps {
  readonly id: string;
  readonly field: ControlFieldViewModel;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly name?: string;
  readonly ariaLabel?: string;
  readonly ariaReadOnly?: boolean;
  readonly tabIndex?: number;
}

export function ControlledField({
  id,
  field,
  className,
  inputClassName,
  name,
  ariaLabel,
  ariaReadOnly,
  tabIndex,
}: ControlledFieldProps) {
  const dispatch = useUiCommand();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const nativeCommittedValue = useRef<string | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      const restoreInputDefaults = () => {
        if (inputRef.current !== input) return;
        input.setAttribute("value", field.defaultValue);
        input.defaultValue = field.defaultValue;
        input.defaultChecked = Boolean(field.defaultChecked);
      };
      restoreInputDefaults();
      queueMicrotask(restoreInputDefaults);
    }
    const select = selectRef.current;
    if (select) {
      for (const option of select.options) {
        option.defaultSelected = option.value === field.defaultSelectedValue;
      }
    }
  }, [
    field.defaultChecked,
    field.defaultSelectedValue,
    field.defaultValue,
    field.value,
  ]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || field.kind === "checkbox" || field.kind === "radio") return;
    const handleNativeChange = () => {
      nativeCommittedValue.current = input.value;
      void dispatch(controlCommitCommand(id, input.value));
    };
    input.addEventListener("change", handleNativeChange);
    return () => {
      input.removeEventListener("change", handleNativeChange);
    };
  }, [dispatch, field.kind, id]);

  if (field.kind === "select") {
    const selectProps = {
      ref: selectRef,
      className,
      id,
      value: field.value,
      disabled: field.disabled,
      "aria-label": ariaLabel,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
        void dispatch(controlCommitCommand(id, event.currentTarget.value));
      },
    };
    return (
      <select {...selectProps}>
        {(field.options ?? []).map((option, index, options) => (
          <Fragment key={option.value}>
            <option value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
            {field.separateOptions && index < options.length - 1 ? " " : null}
          </Fragment>
        ))}
      </select>
    );
  }

  if (field.kind === "checkbox" || field.kind === "radio") {
    return (
      <input
        ref={inputRef}
        className={className}
        id={id}
        name={name}
        type={field.kind}
        {...(field.value !== "on" ? { value: field.value } : {})}
        checked={Boolean(field.checked)}
        disabled={field.disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          void dispatch(
            controlCommitCommand(
              id,
              event.currentTarget.value,
              event.currentTarget.checked,
            ),
          );
        }}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      className={classNames(
        className,
        inputClassName,
        field.invalid && "is-invalid",
      )}
      id={id}
      type={field.kind}
      value={field.value}
      min={field.min}
      max={field.max}
      step={field.step}
      placeholder={field.placeholder}
      disabled={field.disabled}
      readOnly={field.readOnly}
      aria-readonly={ariaReadOnly || undefined}
      aria-invalid={field.invalid || undefined}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onInput={(event) => {
        nativeCommittedValue.current = null;
        void dispatch(controlDraftCommand(id, event.currentTarget.value));
      }}
      onChange={() => undefined}
      onBlur={(event) => {
        if (nativeCommittedValue.current === event.currentTarget.value) {
          nativeCommittedValue.current = null;
          return;
        }
        void dispatch(controlCommitCommand(id, event.currentTarget.value));
      }}
    />
  );
}

export interface ControlledCheckProps {
  readonly id: string;
  readonly field: ControlFieldViewModel;
  readonly label: ReactNode;
  readonly className: string;
}

export function ControlledCheck({
  id,
  field,
  label,
  className,
}: ControlledCheckProps) {
  return (
    <label className={className}>
      <ControlledField id={id} field={field} />
      <span>{label}</span>
    </label>
  );
}
