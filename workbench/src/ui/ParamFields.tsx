import type { ReactNode, SVGProps } from "react";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import type { IconType } from "@astryxdesign/core/Icon";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Section } from "@astryxdesign/core/Section";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import { Tooltip } from "@astryxdesign/core/Tooltip";

import { formatInteger } from "./number-format.ts";

function makeAxisGlyph(char: string): IconType {
  const Glyph = (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...props}>
      <text
        x={12}
        y={12}
        fill="currentColor"
        fontSize={char.length > 1 ? 13 : 16}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {char}
      </text>
    </svg>
  );
  Glyph.displayName = `AxisGlyph(${char})`;
  return Glyph;
}

const AXIS_GLYPH = {
  X: makeAxisGlyph("X"),
  Y: makeAxisGlyph("Y"),
  Z: makeAxisGlyph("Z"),
  W: makeAxisGlyph("W"),
  L: makeAxisGlyph("L"),
  R: makeAxisGlyph("R"),
  P: makeAxisGlyph("P"),
  D: makeAxisGlyph("D"),
  C: makeAxisGlyph("C"),
  V: makeAxisGlyph("V"),
  H: makeAxisGlyph("H"),
  Min: makeAxisGlyph("Min"),
  Max: makeAxisGlyph("Max"),
  lmin: makeAxisGlyph("L0"),
  lmax: makeAxisGlyph("L1"),
} as const;

export type AxisGlyphKey = keyof typeof AXIS_GLYPH;

export interface ParamFieldStatus {
  readonly type: "error" | "warning" | "success";
  readonly message?: string;
}

export interface ParamNumberProps {
  readonly testId?: string;
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (value: number) => void;
  readonly onClear?: () => void;
  readonly min?: number | null;
  readonly max?: number | null;
  readonly step?: number | null;
  readonly units?: string;
  readonly tooltip?: string;
  readonly placeholder?: string;
  readonly isIntegerOnly?: boolean;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
  readonly disabledMessage?: string;
  readonly hasClear?: boolean;
  readonly isLabelHidden?: boolean;
  readonly formatValue?: (value: number) => string;
  readonly hasNumberSteppers?: boolean;
  readonly prefix?: AxisGlyphKey;
  readonly status?: ParamFieldStatus;
  readonly spanFull?: boolean;
}

export function ParamNumber({
  testId,
  label,
  value,
  onChange,
  onClear,
  min,
  max,
  step,
  units,
  tooltip,
  placeholder,
  isIntegerOnly,
  isDisabled = false,
  isReadOnly = false,
  disabledMessage,
  hasClear = false,
  isLabelHidden = false,
  formatValue,
  hasNumberSteppers = true,
  prefix,
  status,
  spanFull = false,
}: ParamNumberProps) {
  const resolvedFormatValue =
    formatValue ?? (isIntegerOnly ? formatInteger : undefined);
  const roundedValue =
    value !== null &&
    Number.isFinite(value) &&
    resolvedFormatValue !== undefined
      ? Number(resolvedFormatValue(value))
      : value;
  const effectiveValue =
    roundedValue !== null && Number.isFinite(roundedValue)
      ? roundedValue
      : value;
  const numberInput = (
    <NumberInput
      label={label}
      value={effectiveValue}
      size="sm"
      width="100%"
      isLabelHidden={isLabelHidden}
      isWheelEnabled={false}
      hasNumberSteppers={hasNumberSteppers}
      onChange={(nextValue: number | null) => {
        if (nextValue === null) {
          onClear?.();
          return;
        }
        onChange(nextValue);
      }}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      {...(step !== undefined ? { step } : {})}
      {...(units !== undefined ? { units } : {})}
      {...(!isLabelHidden && tooltip !== undefined
        ? { labelTooltip: tooltip }
        : {})}
      {...(placeholder !== undefined ? { placeholder } : {})}
      {...(isIntegerOnly !== undefined ? { isIntegerOnly } : {})}
      {...(resolvedFormatValue !== undefined
        ? { formatValue: resolvedFormatValue }
        : {})}
      {...(prefix !== undefined ? { startIcon: AXIS_GLYPH[prefix] } : {})}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      {...(disabledMessage !== undefined ? { disabledMessage } : {})}
      hasClear={hasClear}
      {...(status !== undefined
        ? { status, statusVariant: "tooltip" as const }
        : {})}
    />
  );
  return (
    <div
      className={
        spanFull ? "oat-field-fill oat-param-span-full" : "oat-field-fill"
      }
      data-testid={testId}
    >
      {isLabelHidden && tooltip !== undefined ? (
        <Tooltip
          content={tooltip}
          placement="above"
          delay={150}
          focusTrigger="never"
          touchTrigger="none"
          hasHoverIndication={false}
        >
          {numberInput}
        </Tooltip>
      ) : (
        numberInput
      )}
    </div>
  );
}

export interface ParamTextProps {
  readonly testId?: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onEnter?: () => void;
  readonly placeholder?: string;
  readonly tooltip?: string;
  readonly isDisabled?: boolean;
  readonly isReadOnly?: boolean;
  readonly hasClear?: boolean;
  readonly isLabelHidden?: boolean;
  readonly status?: ParamFieldStatus;
  readonly spanFull?: boolean;
}

export function ParamText({
  testId,
  label,
  value,
  onChange,
  onEnter,
  placeholder,
  tooltip,
  isDisabled = false,
  isReadOnly = false,
  hasClear = false,
  isLabelHidden = false,
  status,
  spanFull = false,
}: ParamTextProps) {
  return (
    <div
      className={
        spanFull ? "oat-field-fill oat-param-span-full" : "oat-field-fill"
      }
      data-testid={testId}
    >
      <TextInput
        label={label}
        value={value}
        size="sm"
        width="100%"
        isLabelHidden={isLabelHidden}
        isDisabled={isDisabled}
        isReadOnly={isReadOnly}
        hasClear={hasClear}
        onChange={(nextValue) => {
          onChange(nextValue);
        }}
        {...(onEnter !== undefined ? { onEnter } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(tooltip !== undefined ? { labelTooltip: tooltip } : {})}
        {...(status !== undefined
          ? { status, statusVariant: "tooltip" as const }
          : {})}
      />
    </div>
  );
}

export interface ParamSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ParamSelectProps {
  readonly testId?: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly ParamSelectOption[];
  readonly onChange: (value: string) => void;
  readonly renderOption?: (option: SelectorOptionData) => ReactNode;
  readonly renderValue?: (option: SelectorOptionData) => ReactNode;
  readonly tooltip?: string;
  readonly isDisabled?: boolean;
  readonly disabledMessage?: string;
  readonly isLabelHidden?: boolean;
  readonly spanFull?: boolean;
}

export function ParamSelect({
  testId,
  label,
  value,
  options,
  onChange,
  renderOption,
  renderValue,
  tooltip,
  isDisabled = false,
  disabledMessage,
  isLabelHidden = false,
  spanFull = false,
}: ParamSelectProps) {
  const selector = (
    <Selector
      label={label}
      value={value}
      size="sm"
      width="100%"
      isLabelHidden={isLabelHidden}
      isDisabled={isDisabled}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        ...(option.disabled ? { disabled: true } : {}),
      }))}
      onChange={(nextValue) => {
        if (typeof nextValue === "string") {
          onChange(nextValue);
        }
      }}
      {...(renderOption !== undefined ? { renderOption } : {})}
      {...(renderValue !== undefined ? { renderValue } : {})}
      {...(!isLabelHidden && tooltip !== undefined
        ? { labelTooltip: tooltip }
        : {})}
      {...(disabledMessage !== undefined ? { disabledMessage } : {})}
    />
  );
  return (
    <div
      className={
        spanFull ? "oat-field-fill oat-param-span-full" : "oat-field-fill"
      }
      data-testid={testId}
    >
      {isLabelHidden && tooltip !== undefined ? (
        <Tooltip
          content={tooltip}
          placement="above"
          delay={150}
          focusTrigger="never"
          touchTrigger="none"
          hasHoverIndication={false}
        >
          {selector}
        </Tooltip>
      ) : (
        selector
      )}
    </div>
  );
}

export interface ParamCheckboxProps {
  readonly testId?: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly tooltip?: string;
  readonly isDisabled?: boolean;
  readonly disabledMessage?: string;
  readonly spanFull?: boolean;
}

export function ParamCheckbox({
  testId,
  label,
  checked,
  onChange,
  tooltip,
  isDisabled = false,
  disabledMessage,
  spanFull = false,
}: ParamCheckboxProps) {
  return (
    <div
      className={spanFull ? "oat-param-span-full" : undefined}
      data-testid={testId}
    >
      <CheckboxInput
        label={label}
        value={checked}
        isDisabled={isDisabled}
        onChange={(nextChecked) => {
          onChange(nextChecked);
        }}
        {...(tooltip !== undefined ? { description: tooltip } : {})}
        {...(disabledMessage !== undefined ? { disabledMessage } : {})}
      />
    </div>
  );
}

export interface ParamSwitchProps {
  readonly testId?: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly tooltip?: string;
  readonly isDisabled?: boolean;
  readonly disabledMessage?: string;
  readonly spanFull?: boolean;
}

export function ParamSwitch({
  testId,
  label,
  checked,
  onChange,
  tooltip,
  isDisabled = false,
  disabledMessage,
  spanFull = false,
}: ParamSwitchProps) {
  return (
    <div
      className={spanFull ? "oat-param-span-full" : undefined}
      data-testid={testId}
    >
      <Switch
        label={label}
        value={checked}
        size="sm"
        labelPosition="start"
        labelSpacing="spread"
        width="100%"
        isDisabled={isDisabled}
        onChange={(nextChecked) => {
          onChange(nextChecked);
        }}
        {...(tooltip !== undefined ? { labelTooltip: tooltip } : {})}
        {...(disabledMessage !== undefined ? { disabledMessage } : {})}
      />
    </div>
  );
}

export interface ParamSliderProps {
  readonly testId?: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  readonly isLabelHidden?: boolean;
  readonly formatValue?: (value: number) => string;
  readonly isDisabled?: boolean;
}

export function ParamSlider({
  testId,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  isLabelHidden = false,
  formatValue,
  isDisabled = false,
}: ParamSliderProps) {
  return (
    <div data-testid={testId}>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        width="100%"
        isLabelHidden={isLabelHidden}
        isDisabled={isDisabled}
        onChange={(nextValue: number | [number, number]) => {
          if (typeof nextValue === "number") {
            onChange(nextValue);
          }
        }}
        {...(formatValue !== undefined ? { formatValue } : {})}
      />
    </div>
  );
}

export function ParamGrid({
  columns = 2,
  children,
}: {
  readonly columns?: 1 | 2 | 3;
  readonly children: ReactNode;
}) {
  const cls =
    columns === 3
      ? "oat-param-grid oat-param-grid--3"
      : columns === 1
        ? "oat-param-grid oat-param-grid--1"
        : "oat-param-grid";
  return <div className={cls}>{children}</div>;
}

export function ParamSection({
  title,
  defaultIsOpen = true,
  isOpen,
  onOpenChange,
  testId,
  children,
}: {
  readonly title: string;
  readonly defaultIsOpen?: boolean;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible
      trigger={
        <Text type="label" weight="semibold">
          {title}
        </Text>
      }
      defaultIsOpen={defaultIsOpen}
      {...(isOpen !== undefined ? { isOpen } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
      {...(testId !== undefined ? { "data-testid": testId } : {})}
    >
      <div className="oat-section-stack">{children}</div>
    </Collapsible>
  );
}

export function InspectorSection({
  title,
  actions,
  dividers = ["bottom"],
  testId,
  children,
}: {
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly dividers?: ("top" | "bottom" | "start" | "end")[];
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <Section
      variant="transparent"
      padding={3}
      dividers={dividers}
      {...(testId !== undefined ? { "data-testid": testId } : {})}
    >
      <div className="oat-inspector-section-body">
        {title || actions ? (
          <HStack hAlign="between" vAlign="center" gap={2}>
            {title ? (
              <Text type="label" weight="semibold">
                {title}
              </Text>
            ) : (
              <span />
            )}
            {actions}
          </HStack>
        ) : null}
        {children}
      </div>
    </Section>
  );
}

export function InspectorCollapsibleSection({
  title,
  defaultIsOpen = false,
  isOpen,
  onOpenChange,
  dividers = ["bottom"],
  testId,
  children,
}: {
  readonly title: string;
  readonly defaultIsOpen?: boolean;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly dividers?: ("top" | "bottom" | "start" | "end")[];
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <Section variant="transparent" padding={3} dividers={dividers}>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {title}
          </Text>
        }
        defaultIsOpen={defaultIsOpen}
        {...(isOpen !== undefined ? { isOpen } : {})}
        {...(onOpenChange !== undefined ? { onOpenChange } : {})}
        {...(testId !== undefined ? { "data-testid": testId } : {})}
      >
        <div className="oat-inspector-section-body oat-inspector-section-body--collapsible">
          {children}
        </div>
      </Collapsible>
    </Section>
  );
}

export function InspectorRow({
  label,
  tooltip,
  align = "center",
  hAlign,
  stacked = false,
  children,
}: {
  readonly label: string;
  readonly tooltip?: string;
  readonly align?: "center" | "start";
  readonly hAlign?: "start" | "end";
  readonly stacked?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="oat-inspector-row" data-align={align}>
      <div className="oat-inspector-label">
        {tooltip ? (
          <Tooltip
            content={tooltip}
            placement="above"
            delay={150}
            focusTrigger="never"
            touchTrigger="none"
            hasHoverIndication={false}
          >
            <span className="oat-inspector-label-text" data-has-tooltip="true">
              {label}
            </span>
          </Tooltip>
        ) : (
          <span className="oat-inspector-label-text">{label}</span>
        )}
      </div>
      <div
        className={
          stacked
            ? "oat-inspector-controls oat-inspector-controls--stack"
            : "oat-inspector-controls"
        }
        {...(hAlign !== undefined ? { "data-align": hAlign } : {})}
      >
        {children}
      </div>
    </div>
  );
}

export function InspectorSwitchRow({
  label,
  switchLabel,
  checked,
  tooltip,
  isDisabled = false,
  disabledMessage,
  onChange,
}: {
  readonly label: string;
  readonly switchLabel?: string;
  readonly checked: boolean;
  readonly tooltip?: string;
  readonly isDisabled?: boolean;
  readonly disabledMessage?: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <InspectorRow label={label} {...(tooltip !== undefined ? { tooltip } : {})}>
      <Switch
        label={switchLabel ?? label}
        isLabelHidden
        value={checked}
        size="sm"
        isDisabled={isDisabled}
        onChange={(nextChecked) => {
          onChange(nextChecked);
        }}
        {...(disabledMessage !== undefined ? { disabledMessage } : {})}
      />
    </InspectorRow>
  );
}

export type InlineNumberFieldProps = Omit<
  ParamNumberProps,
  "isLabelHidden" | "spanFull"
>;

export function InlineNumberField(props: InlineNumberFieldProps) {
  return <ParamNumber {...props} isLabelHidden />;
}

export function SliderNumberRow({
  label,
  value,
  min,
  max,
  step = 1,
  units,
  tooltip,
  formatValue,
  isIntegerOnly = false,
  isDisabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly units?: string;
  readonly tooltip?: string;
  readonly formatValue?: (value: number) => string;
  readonly isIntegerOnly?: boolean;
  readonly isDisabled?: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="oat-slider-number-row" data-has-units={Boolean(units)}>
      <div className="oat-field-fill">
        <Slider
          label={label}
          isLabelHidden
          valueDisplay="none"
          value={value}
          min={min}
          max={max}
          step={step}
          width="100%"
          isDisabled={isDisabled}
          onChange={(nextValue: number | [number, number]) => {
            if (typeof nextValue === "number") {
              onChange(nextValue);
            }
          }}
        />
      </div>
      <InlineNumberField
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        isIntegerOnly={isIntegerOnly}
        isDisabled={isDisabled}
        onChange={onChange}
        {...(units !== undefined ? { units } : {})}
        {...(tooltip !== undefined ? { tooltip } : {})}
        {...(formatValue !== undefined ? { formatValue } : {})}
      />
    </div>
  );
}

export interface MultiToggleOption {
  readonly id: string;
  readonly label: string;
  readonly tooltip?: string;
  readonly disabled?: boolean;
}

export function MultiToggleRow({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly MultiToggleOption[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  return (
    <ToggleButtonGroup
      label={label}
      type="multiple"
      size="sm"
      className="oat-pill-toggle-group"
      value={[...value]}
      onChange={onChange}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.id}
          value={option.id}
          label={option.label}
          isDisabled={Boolean(option.disabled)}
          {...(option.tooltip !== undefined ? { tooltip: option.tooltip } : {})}
        />
      ))}
    </ToggleButtonGroup>
  );
}
