import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import type { UiCommand } from "../../runtime/ui-command.ts";
import { classNames } from "../class-names.ts";

export type ValueCommand<TValue> = (
  value: TValue,
) => UiCommand<string, unknown>;

export interface FieldProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly unit?: ReactNode;
  readonly help?: ReactNode;
  readonly error?: ReactNode;
}

export function Field({ id, label, children, unit, help, error }: FieldProps) {
  const detailId = help || error ? `${id}-detail` : undefined;
  return (
    <label className="oat-field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {unit ? <span>{unit}</span> : null}
      {detailId ? (
        <small id={detailId} role={error ? "alert" : undefined}>
          {error ?? help}
        </small>
      ) : null}
    </label>
  );
}

interface SharedInputProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly command: ValueCommand<string>;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly invalid?: boolean;
  readonly help?: ReactNode;
  readonly error?: ReactNode;
  readonly unit?: ReactNode;
  readonly compact?: boolean;
}

export interface TextFieldProps extends SharedInputProps {
  readonly value: string;
  readonly placeholder?: string;
  readonly autoComplete?: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
}

export function TextField({
  id,
  label,
  value,
  command,
  disabled = false,
  readOnly = false,
  invalid = false,
  help,
  error,
  unit,
  compact = false,
  placeholder,
  autoComplete,
}: TextFieldProps) {
  const dispatch = useUiCommand();
  const detailId = help || error ? `${id}-detail` : undefined;
  return (
    <Field id={id} label={label} help={help} error={error} unit={unit}>
      <input
        className={classNames(
          "oat-input",
          compact && "oat-input--compact",
          invalid && "is-invalid",
        )}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={detailId}
        onChange={(event) => {
          void dispatch(command(event.currentTarget.value));
        }}
      />
    </Field>
  );
}

export interface NumberFieldProps extends SharedInputProps {
  readonly value: string | number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export function NumberField({
  id,
  label,
  value,
  command,
  min,
  max,
  step,
  disabled = false,
  readOnly = false,
  invalid = false,
  help,
  error,
  unit,
  compact = false,
}: NumberFieldProps) {
  const dispatch = useUiCommand();
  const detailId = help || error ? `${id}-detail` : undefined;
  return (
    <Field id={id} label={label} help={help} error={error} unit={unit}>
      <input
        className={classNames(
          "oat-input",
          compact && "oat-input--compact",
          invalid && "is-invalid",
        )}
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={detailId}
        onChange={(event) => {
          void dispatch(command(event.currentTarget.value));
        }}
      />
    </Field>
  );
}

export interface SelectOption {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
}

export interface SelectFieldProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly command: ValueCommand<string>;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly help?: ReactNode;
  readonly selectProps?: Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "className" | "disabled" | "id" | "onChange" | "value"
  >;
}

export function SelectField({
  id,
  label,
  value,
  options,
  command,
  disabled = false,
  compact = false,
  help,
  selectProps,
}: SelectFieldProps) {
  const dispatch = useUiCommand();
  return (
    <Field id={id} label={label} help={help}>
      <select
        {...selectProps}
        className={classNames("oat-input", compact && "oat-input--compact")}
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={help ? `${id}-detail` : undefined}
        onChange={(event) => {
          void dispatch(command(event.currentTarget.value));
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
    </Field>
  );
}
