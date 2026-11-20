import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";

export interface MetricItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly wide?: boolean;
}

export function MetricGrid({
  items,
  columns = 2,
  testId,
}: {
  readonly items: readonly MetricItem[];
  readonly columns?: 2 | 3;
  readonly testId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={
        columns === 3 ? "oat-metric-grid oat-metric-grid--3" : "oat-metric-grid"
      }
      data-testid={testId}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={
            item.wide
              ? "oat-metric-card oat-metric-card--wide"
              : "oat-metric-card"
          }
        >
          <span className="oat-metric-label">{item.label}</span>
          <span className="oat-metric-value" title={item.value}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface KeyValueItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly valueId?: string | undefined;
  readonly tooltip?: string | undefined;
}

export function KeyValueList({
  items,
  testId,
}: {
  readonly items: readonly KeyValueItem[];
  readonly testId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <dl className="oat-kv-list" data-testid={testId}>
      {items.map((item) => (
        <div key={item.id} className="oat-kv-row">
          <dt className="oat-kv-label">
            {item.tooltip ? (
              <Tooltip
                content={item.tooltip}
                placement="above"
                delay={150}
                focusTrigger="never"
                touchTrigger="none"
                hasHoverIndication={false}
              >
                <span
                  className="oat-inspector-label-text"
                  data-has-tooltip="true"
                >
                  {item.label}
                </span>
              </Tooltip>
            ) : (
              item.label
            )}
          </dt>
          <dd className="oat-kv-tabular">
            <span {...(item.valueId ? { id: item.valueId } : {})}>
              {item.value}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ChartFrame({
  title,
  subtitle,
  actions,
  testId,
  children,
}: {
  readonly title?: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="oat-section-stack" data-testid={testId}>
      {title || actions ? (
        <HStack hAlign="between" vAlign="center" gap={2}>
          <div>
            {title ? (
              <Text type="label" weight="semibold" display="block">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text type="supporting" color="secondary" display="block">
                {subtitle}
              </Text>
            ) : null}
          </div>
          {actions}
        </HStack>
      ) : null}
      <div className="oat-chart-frame">{children}</div>
    </div>
  );
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error";

export function StatusBadge({
  label,
  tone = "neutral",
  icon,
}: {
  readonly label: string;
  readonly tone?: StatusTone;
  readonly icon?: ReactNode;
}) {
  return (
    <Badge
      label={label}
      variant={tone}
      {...(icon !== undefined ? { icon } : {})}
    />
  );
}

export function DockEmptyState({
  title,
  description,
  icon,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      isCompact
      headingLevel={4}
      {...(description !== undefined ? { description } : {})}
      {...(icon !== undefined ? { icon } : {})}
      {...(actions !== undefined ? { actions } : {})}
    />
  );
}

export function PanelSectionHeader({
  title,
  meta,
  actions,
}: {
  readonly title: string;
  readonly meta?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={2}>
      <div style={{ minWidth: 0 }}>
        <Text type="label" weight="semibold" display="block">
          {title}
        </Text>
        {meta ? (
          <Text type="supporting" color="secondary" display="block">
            {meta}
          </Text>
        ) : null}
      </div>
      {actions}
    </HStack>
  );
}
