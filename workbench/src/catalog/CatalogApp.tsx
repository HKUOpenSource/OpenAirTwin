import { useEffect, useState } from "react";

import {
  Button,
  ButtonGroup,
  IconButton,
} from "../design-system/components/Button.tsx";
import {
  Badge,
  EmptyState,
  ListCard,
  MetricGrid,
} from "../design-system/components/DataDisplay.tsx";
import {
  NumberField,
  SelectField,
  TextField,
} from "../design-system/components/Field.tsx";
import { Icon } from "../design-system/components/Icon.tsx";
import {
  Panel,
  PanelHeader,
  ScrollRegion,
} from "../design-system/components/Panel.tsx";
import { Checkbox } from "../design-system/components/Selection.tsx";
import type { UiCommand } from "../runtime/ui-command.ts";
import { CommandBus } from "../runtime/ui-command.ts";

const command = (
  name: string,
  payload?: unknown,
): UiCommand<string, unknown> => ({
  name,
  payload,
});

const noopCommand = command("catalog.component.activate");

export interface CatalogAppProps {
  readonly commandBus: CommandBus;
}

export function CatalogApp({ commandBus }: CatalogAppProps) {
  const [lastCommand, setLastCommand] = useState("No command dispatched");

  useEffect(
    () =>
      commandBus.subscribe("*", (nextCommand) => {
        setLastCommand(nextCommand.name);
      }),
    [commandBus],
  );

  return (
    <>
      <section
        className="oat-catalog__section"
        aria-labelledby="react-buttons-title"
      >
        <h2 id="react-buttons-title">Buttons</h2>
        <div className="oat-catalog__row" data-catalog-family="button">
          <span data-parity-key="button-default">
            <Button label="Default" command={noopCommand} />
          </span>
          <span data-parity-key="button-primary">
            <Button label="Primary" variant="primary" command={noopCommand} />
          </span>
          <span data-parity-key="button-compact">
            <Button label="Compact" size="compact" command={noopCommand} />
          </span>
          <span data-parity-key="button-danger">
            <Button
              label="Danger"
              size="compact"
              variant="danger"
              command={noopCommand}
            />
          </span>
          <span data-parity-key="button-pressed">
            <Button label="Pressed" pressed command={noopCommand} />
          </span>
          <span data-parity-key="button-busy">
            <Button label="Busy" busy command={noopCommand} />
          </span>
          <span data-parity-key="button-disabled">
            <Button label="Disabled" disabled command={noopCommand} />
          </span>
          <span data-parity-key="button-icon">
            <IconButton
              label="Locate transmitter"
              command={noopCommand}
              icon={
                <Icon>
                  <circle cx="12" cy="12" r="7" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </Icon>
              }
            />
          </span>
          <span data-parity-key="button-toolbar">
            <Button
              label="Toolbar"
              size="compact"
              toolbar
              command={noopCommand}
            />
          </span>
          <span data-parity-key="button-block">
            <Button
              label="Block"
              variant="primary"
              block
              command={noopCommand}
            />
          </span>
        </div>
      </section>

      <section
        className="oat-catalog__section"
        aria-labelledby="react-fields-title"
      >
        <h2 id="react-fields-title">Fields and selection</h2>
        <div className="oat-catalog__grid" data-catalog-family="field">
          <span data-parity-key="field-text">
            <TextField
              id="react-catalog-text"
              label="Text field"
              value="OpenAirTwin"
              command={(value) => command("catalog.field.change", value)}
            />
          </span>
          <span data-parity-key="field-select">
            <SelectField
              id="react-catalog-select"
              label="Compact select"
              value="link"
              compact
              options={[{ label: "Link Analysis", value: "link" }]}
              command={(value) => command("catalog.select.change", value)}
            />
          </span>
          <span data-parity-key="field-invalid">
            <TextField
              id="react-catalog-invalid"
              label="Invalid field"
              value="Invalid"
              invalid
              command={(value) => command("catalog.field.change", value)}
            />
          </span>
          <span data-parity-key="field-readonly">
            <TextField
              id="react-catalog-readonly"
              label="Read-only field"
              value="42.0 m"
              readOnly
              command={(value) => command("catalog.field.change", value)}
            />
          </span>
          <span data-parity-key="field-disabled">
            <TextField
              id="react-catalog-disabled"
              label="Disabled field"
              value="Unavailable"
              disabled
              command={(value) => command("catalog.field.change", value)}
            />
          </span>
          <span data-parity-key="check-checked">
            <Checkbox
              label="Checked option"
              checked
              command={(checked) => command("catalog.checkbox.change", checked)}
            />
          </span>
          <span data-parity-key="check-disabled">
            <Checkbox
              label="Disabled option"
              checked={false}
              disabled
              command={(checked) => command("catalog.checkbox.change", checked)}
            />
          </span>
        </div>
      </section>

      <section
        className="oat-catalog__section"
        aria-labelledby="react-data-title"
      >
        <h2 id="react-data-title">Status and data</h2>
        <div className="oat-catalog__row" data-catalog-family="badge">
          <span data-parity-key="badge-neutral">
            <Badge label="Neutral" />
          </span>
          <span data-parity-key="badge-success">
            <Badge label="Success" tone="success" />
          </span>
          <span data-parity-key="badge-warning">
            <Badge label="Warning" tone="warning" />
          </span>
          <span data-parity-key="badge-error">
            <Badge label="Error" tone="error" />
          </span>
          <span data-parity-key="badge-busy">
            <Badge label="Busy" tone="busy" />
          </span>
        </div>
        <div data-parity-key="metric-grid">
          <MetricGrid
            items={[
              { id: "gain", label: "Total Path Gain", value: "-81.25 dB" },
              { id: "paths", label: "Paths", value: "12" },
            ]}
          />
        </div>
        <ScrollRegion className="oat-catalog__list">
          <span data-parity-key="list-interactive">
            <ListCard
              title="Interactive list card"
              command={command("catalog.result.select", "interactive")}
            />
          </span>
          <span data-parity-key="list-selected">
            <ListCard
              title="Selected list card"
              selected
              command={command("catalog.result.select", "selected")}
            />
          </span>
          <span data-parity-key="empty-state">
            <EmptyState message="No results available" />
          </span>
        </ScrollRegion>
      </section>

      <Panel id="react-test-feature" ariaLabel="Contract-only test feature">
        <PanelHeader
          title="Contract-only test feature"
          actions={<Badge label="Ready" tone="busy" />}
        />
        <NumberField
          id="react-feature-frequency"
          label="Carrier Frequency"
          value="5.8"
          command={(value) => command("catalog.frequency.change", value)}
        />
        <ButtonGroup label="Feature actions">
          <Button
            label="Reset"
            size="compact"
            command={command("catalog.feature.reset")}
          />
          <Button
            label="Run"
            variant="primary"
            command={command("catalog.feature.run")}
          />
        </ButtonGroup>
        <MetricGrid
          items={[
            { id: "paths", label: "Paths", value: "8" },
            { id: "snr", label: "Peak SNR", value: "24 dB" },
          ]}
        />
        <ScrollRegion tabIndex={0} label="Feature results">
          <ListCard
            title="Selected result"
            selected
            command={command("catalog.result.select", "selected")}
          />
        </ScrollRegion>
      </Panel>

      <output
        className="oat-catalog__command-log"
        id="reactCommandLog"
        aria-live="polite"
      >
        {lastCommand}
      </output>
    </>
  );
}
