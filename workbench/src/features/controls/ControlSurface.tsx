import {
  createElement,
  memo,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import {
  ControlledField,
  type ControlledFieldProps,
} from "../../design-system/components/ControlledField.tsx";
import type { UiExternalStore } from "../../runtime/observable-state.ts";
import { useFeatureSnapshot } from "../../runtime/observable-state.ts";
import {
  controlActionCommand,
  controlGroupToggleCommand,
  type ControlFieldViewModel,
  type ControlNodeViewModel,
  type WorkbenchControlsSnapshot,
} from "./contracts.ts";
import {
  MobilityWaypointList,
  RadarTargetList,
} from "./ControlCollections.tsx";

type StaticProps = Readonly<Record<string, unknown>>;

function nodeProperties(
  id: string,
  staticProps: StaticProps,
  node: ControlNodeViewModel | undefined,
): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...staticProps, id };
  if (!node) return properties;
  properties.className = node.className;
  for (const name of [
    "aria-busy",
    "aria-hidden",
    "aria-pressed",
    "aria-selected",
    "data-state",
    "data-status",
    "title",
  ]) {
    properties[name] = undefined;
  }
  Object.assign(properties, node.attributes);
  if (node.disabled !== undefined) properties.disabled = node.disabled;
  if (node.progressValue !== undefined) properties.value = node.progressValue;
  return properties;
}

const StableSurfaceNode = memo(
  function StableSurfaceNode({
    children,
    properties,
    tag,
  }: {
    readonly children: ReactNode;
    readonly properties: StaticProps;
    readonly tag: string;
  }) {
    return createElement(tag, properties, children);
  },
  () => true,
);

function SurfaceNode({
  children,
  id,
  leaf = false,
  snapshot,
  staticProps,
  tag,
}: {
  readonly children?: ReactNode;
  readonly id: string;
  readonly leaf?: boolean;
  readonly snapshot: WorkbenchControlsSnapshot;
  readonly staticProps: StaticProps;
  readonly tag: string;
}) {
  const properties = nodeProperties(id, staticProps, snapshot.nodes[id]);
  if (leaf) {
    return (
      <StableSurfaceNode
        children={children}
        properties={properties}
        tag={tag}
      />
    );
  }
  return createElement(tag, properties, children);
}

function SurfaceField({
  className,
  id,
  initial,
  snapshot,
  textBoundary = "spaced",
  ...props
}: Omit<ControlledFieldProps, "field"> & {
  readonly initial: ControlFieldViewModel;
  readonly snapshot: WorkbenchControlsSnapshot;
  readonly textBoundary?: "joined" | "spaced";
}) {
  const resolvedClassName = snapshot.nodes[id]?.className ?? className;
  return (
    <>
      {textBoundary === "spaced" ? " " : null}
      <ControlledField
        {...props}
        field={snapshot.fields[id] ?? initial}
        id={id}
        {...(resolvedClassName ? { className: resolvedClassName } : {})}
      />
    </>
  );
}

function SurfaceAction({
  children,
  id,
  snapshot,
  staticProps,
}: {
  readonly children: ReactNode;
  readonly id: string;
  readonly snapshot: WorkbenchControlsSnapshot;
  readonly staticProps: StaticProps;
  readonly tag: string;
}) {
  const dispatch = useUiCommand();
  const properties = nodeProperties(id, staticProps, snapshot.nodes[id]);
  properties.onClick = () => void dispatch(controlActionCommand(id));
  return createElement("button", properties, children);
}

function SurfaceDetails({
  children,
  id,
  snapshot,
  staticProps,
}: {
  readonly children: ReactNode;
  readonly id: string;
  readonly snapshot: WorkbenchControlsSnapshot;
  readonly staticProps: StaticProps;
  readonly tag: string;
}) {
  const dispatch = useUiCommand();
  const node = snapshot.nodes[id];
  const [localOpen, setLocalOpen] = useState(Boolean(staticProps.open));
  const properties = nodeProperties(id, staticProps, node);
  properties.open = node?.open ?? localOpen;
  properties.onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const open = event.currentTarget.open;
    setLocalOpen(open);
    void dispatch(controlGroupToggleCommand(id, open));
  };
  return createElement("details", properties, children);
}

function ControlForm({
  snapshot,
}: {
  readonly snapshot: WorkbenchControlsSnapshot;
}) {
  return (
    <>
      <div className="solverCfg researchParams">
        <details className="paramGroup" open>
          <summary className="paramGroupSummary">{"Physical Layer"}</summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label className="paramField" htmlFor="cfgFrequency">
                <span className="paramLabel">
                  {"Carrier Frequency\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Carrier frequency details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "RF carrier used by the ray tracer. Default 3.5 GHz; changing it alters wavelength/material response with little effect on ray count."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="cfgFrequency"
                    initial={{
                      kind: "number",
                      value: "3.5",
                      defaultValue: "3.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"GHz"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="linkBandwidthMhz">
                <span className="paramLabel">
                  {"Bandwidth\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Bandwidth details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Occupied channel bandwidth for CIR/tap sampling. Default 15.36 MHz; wider bandwidth gives finer delay resolution."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="linkBandwidthMhz"
                    initial={{
                      kind: "number",
                      value: "15.36",
                      defaultValue: "15.36",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.001",
                      step: "0.01",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"MHz"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="linkTapFftSize">
                <span className="paramLabel">
                  {"OFDM Carriers\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="OFDM carriers details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of OFDM frequency bins used for CIR/tap output. Default 512; larger values increase channel post-processing cost."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="linkTapFftSize"
                  initial={{
                    kind: "number",
                    value: "512",
                    defaultValue: "512",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "16",
                    step: "16",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="linkSubcarrierSpacingKhz">
                <span className="paramLabel">
                  {"Subcarrier Spacing\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Subcarrier spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Derived as bandwidth divided by OFDM carriers. Default 30 kHz; sent to the backend as Hz for CIR/taps."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="linkSubcarrierSpacingKhz"
                    initial={{
                      kind: "number",
                      value: "30.00",
                      defaultValue: "30.00",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: true,
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"kHz"}
                  </span>
                </span>
                <SurfaceField
                  id="linkTapSubcarrierSpacing"
                  initial={{
                    kind: "hidden",
                    value: "30000",
                    defaultValue: "30000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup">
          <summary className="paramGroupSummary">{"Antenna Arrays"}</summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label className="paramField" htmlFor="txArrayPattern">
                <span className="paramLabel">
                  {"Tx Pattern\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx antenna pattern details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Sionna antenna pattern used for transmitters. Options come from the backend Sionna registry."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="txArrayPattern"
                  initial={{
                    kind: "select",
                    value: "iso",
                    defaultValue: "iso",
                    defaultSelectedValue: "iso",
                    separateOptions: true,
                    disabled: false,
                    options: [{ label: "iso", value: "iso", disabled: false }],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="txArrayPolarization">
                <span className="paramLabel">
                  {"Tx Polarization\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx polarization details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Transmit antenna polarization. Options come from the backend Sionna registry."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="txArrayPolarization"
                  initial={{
                    kind: "select",
                    value: "V",
                    defaultValue: "V",
                    defaultSelectedValue: "V",
                    separateOptions: true,
                    disabled: false,
                    options: [{ label: "V", value: "V", disabled: false }],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="txArrayRows">
                <span className="paramLabel">
                  {"Tx Rows\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx rows details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of vertical elements in the transmit PlanarArray. Backend caps the total array size."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="txArrayRows"
                  initial={{
                    kind: "number",
                    value: "1",
                    defaultValue: "1",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "16",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="txArrayCols">
                <span className="paramLabel">
                  {"Tx Cols\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx columns details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of horizontal elements in the transmit PlanarArray. Backend caps the total array size."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="txArrayCols"
                  initial={{
                    kind: "number",
                    value: "1",
                    defaultValue: "1",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "16",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="txArrayVerticalSpacing">
                <span className="paramLabel">
                  {"Tx V Spacing\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx vertical spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Vertical element spacing relative to the carrier wavelength. Default 0.5."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="txArrayVerticalSpacing"
                    initial={{
                      kind: "number",
                      value: "0.5",
                      defaultValue: "0.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.01",
                      max: "10",
                      step: "0.01",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"lambda"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="txArrayHorizontalSpacing">
                <span className="paramLabel">
                  {"Tx H Spacing\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx horizontal spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Horizontal element spacing relative to the carrier wavelength. Default 0.5."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="txArrayHorizontalSpacing"
                    initial={{
                      kind: "number",
                      value: "0.5",
                      defaultValue: "0.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.01",
                      max: "10",
                      step: "0.01",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"lambda"}
                  </span>
                </span>
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayPattern"
              >
                <span className="paramLabel">
                  {"Rx Pattern\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx antenna pattern details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Sionna antenna pattern used for link receivers. Options come from the backend Sionna registry."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rxArrayPattern"
                  initial={{
                    kind: "select",
                    value: "iso",
                    defaultValue: "iso",
                    defaultSelectedValue: "iso",
                    separateOptions: true,
                    disabled: false,
                    options: [{ label: "iso", value: "iso", disabled: false }],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayPolarization"
              >
                <span className="paramLabel">
                  {"Rx Polarization\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx polarization details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Receiver antenna polarization for link solves. Radio maps only use the Tx array."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rxArrayPolarization"
                  initial={{
                    kind: "select",
                    value: "V",
                    defaultValue: "V",
                    defaultSelectedValue: "V",
                    separateOptions: true,
                    disabled: false,
                    options: [{ label: "V", value: "V", disabled: false }],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayRows"
              >
                <span className="paramLabel">
                  {"Rx Rows\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx rows details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of vertical elements in the receiver PlanarArray."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rxArrayRows"
                  initial={{
                    kind: "number",
                    value: "1",
                    defaultValue: "1",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "16",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayCols"
              >
                <span className="paramLabel">
                  {"Rx Cols\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx columns details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of horizontal elements in the receiver PlanarArray."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rxArrayCols"
                  initial={{
                    kind: "number",
                    value: "1",
                    defaultValue: "1",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "16",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayVerticalSpacing"
              >
                <span className="paramLabel">
                  {"Rx V Spacing\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx vertical spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Vertical receiver element spacing relative to the carrier wavelength. Default 0.5."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rxArrayVerticalSpacing"
                    initial={{
                      kind: "number",
                      value: "0.5",
                      defaultValue: "0.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.01",
                      max: "10",
                      step: "0.01",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"lambda"}
                  </span>
                </span>
              </label>
              <label
                className="paramField linkOnlyParam deepmimoAntennaParam"
                htmlFor="rxArrayHorizontalSpacing"
              >
                <span className="paramLabel">
                  {"Rx H Spacing\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Rx horizontal spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Horizontal receiver element spacing relative to the carrier wavelength. Default 0.5."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rxArrayHorizontalSpacing"
                    initial={{
                      kind: "number",
                      value: "0.5",
                      defaultValue: "0.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.01",
                      max: "10",
                      step: "0.01",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"lambda"}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup mobilityOnlyParam hidden">
          <summary className="paramGroupSummary">{"Rx Trajectory"}</summary>
          <div className="paramGroupBody">
            <div className="trajectoryActions">
              <SurfaceAction
                id="btnMobilityAddRxPoint"
                tag="button"
                staticProps={{
                  className: "oat-button oat-button--compact",
                  type: "button",
                }}
                snapshot={snapshot}
              >
                {"Add Current Rx"}
              </SurfaceAction>
              <SurfaceAction
                id="btnMobilityClearPoints"
                tag="button"
                staticProps={{
                  className: "oat-button oat-button--compact",
                  type: "button",
                }}
                snapshot={snapshot}
              >
                {"Clear"}
              </SurfaceAction>
            </div>
            <MobilityWaypointList items={snapshot.mobilityWaypoints} />
            <div className="paramGrid">
              <label className="paramField" htmlFor="mobilityVelocity">
                <span className="paramLabel">{"Velocity"}</span>
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityVelocity"
                    initial={{
                      kind: "number",
                      value: "1.5",
                      defaultValue: "1.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.1",
                      max: "30",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m/s"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="mobilityTimeStep">
                <span className="paramLabel">{"Time Step"}</span>
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityTimeStep"
                    initial={{
                      kind: "number",
                      value: "1.0",
                      defaultValue: "1.0",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.1",
                      max: "10",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"s"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="mobilityMaxSteps">
                <span className="paramLabel">{"Max Steps"}</span>
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityMaxSteps"
                    initial={{
                      kind: "number",
                      value: "1000",
                      defaultValue: "1000",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "2",
                      max: "10000",
                      step: "1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"steps"}
                  </span>
                </span>
              </label>
            </div>
            <SurfaceNode
              id="mobilityEstimate"
              tag="div"
              staticProps={{ className: "mobilityEstimate" }}
              snapshot={snapshot}
              leaf
            >
              {"--"}
            </SurfaceNode>
          </div>
        </details>
        <details className="paramGroup propagationSolverGroup">
          <summary className="paramGroupSummary" tabIndex={0}>
            {"Propagation Solver"}
          </summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label
                className="paramField linkOnlyParam"
                htmlFor="linkSamplesPerSrc"
              >
                <span className="paramLabel">
                  {"Samples / Source\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Samples per source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Monte Carlo rays per transmitter. Default 30000; higher values reduce noise but scale runtime directly."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="linkSamplesPerSrc"
                  initial={{
                    kind: "number",
                    value: "30000",
                    defaultValue: "30000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "1000000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField radiomapOnlyParam hidden"
                htmlFor="rmSamplesPerTx"
              >
                <span className="paramLabel">
                  {"Samples / Tx\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Radio map samples details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Base Monte Carlo samples per transmitter for Radio Map. Effective samples scale with the terrain patch subdivision."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rmSamplesPerTx"
                  initial={{
                    kind: "number",
                    value: "1000000",
                    defaultValue: "1000000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "2000000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField linkOnlyParam"
                htmlFor="linkMaxNumPaths"
              >
                <span className="paramLabel">
                  {"Max Paths / Source\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Max paths per source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Upper bound on retained paths per transmitter. Default 1000000; lowering it protects memory in dense scenes."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="linkMaxNumPaths"
                  initial={{
                    kind: "number",
                    value: "1000000",
                    defaultValue: "1000000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "1000000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="cfgMaxDepth">
                <span className="paramLabel">
                  {"Max Depth\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Max depth details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Maximum interaction depth for paths. Default 4; each extra depth can multiply search cost."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="cfgMaxDepth"
                  initial={{
                    kind: "select",
                    value: "4",
                    defaultValue: "4",
                    defaultSelectedValue: "4",
                    separateOptions: true,
                    disabled: false,
                    options: [
                      { label: "2", value: "2", disabled: false },
                      { label: "3", value: "3", disabled: false },
                      { label: "4", value: "4", disabled: false },
                      { label: "5", value: "5", disabled: false },
                      { label: "6", value: "6", disabled: false },
                    ],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="cfgSeed">
                <span className="paramLabel">
                  {"Seed\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Seed details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Random seed for repeatable sampling. Default 42; change it to test solver variance."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="cfgSeed"
                  initial={{
                    kind: "number",
                    value: "42",
                    defaultValue: "42",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "0",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramCheck linkOnlyParam syntheticCheck">
                <SurfaceField
                  id="linkSyntheticArray"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Synthetic Array "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Synthetic array details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Uses a synthetic antenna array approximation. Default off; can reduce geometric work for array studies."
                      }
                    </span>
                  </span>
                </span>
              </label>
            </div>
            <div className="paramCheckGrid">
              <label className="paramCheck">
                <SurfaceField
                  id="cfgLos"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"LoS "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Line of sight details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Direct transmitter-to-receiver paths. Default on; low extra cost and important as a reference component."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck">
                <SurfaceField
                  id="cfgSpecular"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Specular "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Specular reflection details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Mirror-like reflections from surfaces. Default on; cost grows with max depth and samples per source."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck">
                <SurfaceField
                  id="cfgDiffuse"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Diffuse "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Diffuse reflection details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Scattered reflection energy from rough surfaces. Default off; can add variance and solver time."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck">
                <SurfaceField
                  id="cfgRefraction"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Refraction "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Refraction details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Transmission through materials. Default on; useful around glass and indoor boundaries."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck linkOnlyParam">
                <SurfaceField
                  id="linkDiffraction"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Diffraction "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Diffraction details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Bending around wedges and edges. Default off; improves NLoS modeling but increases PathSolver work."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck linkOnlyParam">
                <SurfaceField
                  id="linkEdgeDiffraction"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Edge Diffraction "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Edge diffraction details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Explicit edge interaction search for diffracted paths. Default off; enable only when edge effects matter."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramCheck linkOnlyParam wide">
                <SurfaceField
                  id="linkDiffractionLitRegion"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Diffraction Lit Region "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Diffraction lit region details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Includes lit-region diffraction contributions. Default off; can add paths near shadow boundaries."
                      }
                    </span>
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup linkOnlyParam">
          <summary className="paramGroupSummary">{"Channel Output"}</summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label className="paramCheck computeCheck">
                <SurfaceField
                  id="linkComputeTaps"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Compute Channel Impulse Response (CIR) "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Compute CIR details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Requests compact channel-tap summaries after path solving. Default off; enables the right-side Power Delay Profile section."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="linkTapLMin">
                <span className="paramLabel">
                  {"Tap l_min\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tap l_min details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "First discrete tap index to report. Default 0; keep the range tight for fast channel post-processing."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="linkTapLMin"
                  initial={{
                    kind: "number",
                    value: "0",
                    defaultValue: "0",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="linkTapLMax">
                <span className="paramLabel">
                  {"Tap l_max\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tap l_max details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Last discrete tap index to report. Default 100; larger ranges increase response size and work."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="linkTapLMax"
                  initial={{
                    kind: "number",
                    value: "100",
                    defaultValue: "100",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup livePreviewParam hidden">
          <summary className="paramGroupSummary">{"Live Preview"}</summary>
          <div className="paramGroupBody">
            <div className="paramCheckGrid">
              <label className="paramCheck wide">
                <SurfaceField
                  id="livePreviewEnabled"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Enable Live Preview "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Live preview details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Runs low-cost previews while moving devices, then a final solve after movement stops. Default off to protect shared GPU time."
                      }
                    </span>
                  </span>
                </span>
              </label>
            </div>
            <div className="paramGrid">
              <label
                className="paramField livePreviewLinkParam hidden"
                htmlFor="livePreviewLinkSamples"
              >
                <span className="paramLabel">
                  {"Preview Samples / Source\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Preview link samples details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {"Low-sample path solve used while dragging Link Tx/Rx."}
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="livePreviewLinkSamples"
                  initial={{
                    kind: "number",
                    value: "1000",
                    defaultValue: "1000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "1000000",
                    step: "100",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label
                className="paramField livePreviewLinkParam hidden"
                htmlFor="livePreviewPathsDelay"
              >
                <span className="paramLabel">
                  {"Paths Delay\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Paths delay details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Minimum seconds between path previews and idle delay before the final solve."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="livePreviewPathsDelay"
                    initial={{
                      kind: "number",
                      value: "0.8",
                      defaultValue: "0.8",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "10",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"s"}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup radiomapOnlyParam hidden">
          <summary className="paramGroupSummary">{"Terrain Patch"}</summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label className="paramField" htmlFor="rmSizeX">
                <span className="paramLabel">
                  {"Patch Size X\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Patch size X details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Radio-map width in scene meters. Default 160 m; larger patches increase cell count."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmSizeX"
                    initial={{
                      kind: "number",
                      value: "160.0",
                      defaultValue: "160.0",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="rmSizeY">
                <span className="paramLabel">
                  {"Patch Size Y\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Patch size Y details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Radio-map depth in scene meters. Default 160 m; larger patches increase solve time."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmSizeY"
                    initial={{
                      kind: "number",
                      value: "160.0",
                      defaultValue: "160.0",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="rmHeightOffset">
                <span className="paramLabel">
                  {"Height Offset\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Height offset details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Sampling height above terrain. Default 1.5 m; useful for receiver-height studies."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmHeightOffset"
                    initial={{
                      kind: "number",
                      value: "1.5",
                      defaultValue: "1.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="rmCellSize">
                <span className="paramLabel">
                  {"Cell Size\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Cell size details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Optional XY grid size in meters. Generates a terrain-following measurement grid; leave blank for Auto Density Level."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmCellSize"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.01",
                      max: "100",
                      step: "0.1",
                      placeholder: "Auto",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="rmDensityLevel">
                <span className="paramLabel">
                  {"Density Level\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Density details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Auto resolution fallback from 1 to 3. Ignored when Cell Size is set."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rmDensityLevel"
                  initial={{
                    kind: "number",
                    value: "2",
                    defaultValue: "2",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "3",
                    step: "1",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="rmColormap">
                <span className="paramLabel">
                  {"Colormap\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Colormap details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Display color scale for the radio-map overlay and result colorbar."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="rmColormap"
                  initial={{
                    kind: "select",
                    value: "jet",
                    defaultValue: "jet",
                    defaultSelectedValue: "jet",
                    separateOptions: true,
                    disabled: false,
                    options: [
                      { label: "viridis", value: "viridis", disabled: false },
                      { label: "plasma", value: "plasma", disabled: false },
                      { label: "turbo", value: "turbo", disabled: false },
                      { label: "jet", value: "jet", disabled: false },
                    ],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="rmColorMin">
                <span className="paramLabel">
                  {"Color Min\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Color minimum details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Lower display bound for radio-map coloring. Default -140 dB; display-only, no solver cost."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmColorMin"
                    initial={{
                      kind: "number",
                      value: "-140",
                      defaultValue: "-140",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"dB"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="rmColorMax">
                <span className="paramLabel">
                  {"Color Max\n                  "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Color maximum details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Upper display bound for radio-map coloring. Default -80 dB; display-only, no solver cost."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="rmColorMax"
                    initial={{
                      kind: "number",
                      value: "-80",
                      defaultValue: "-80",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"dB"}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>
        <details className="paramGroup deepmimoOnlyParam hidden">
          <summary className="paramGroupSummary">{"DeepMIMO ROI"}</summary>
          <div className="paramGroupBody">
            <div className="paramGrid">
              <label className="paramField" htmlFor="deepMimoScenarioName">
                <span className="paramLabel">
                  {"Scenario Name "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO scenario name details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Dataset folder/name used in the DeepMIMO export. Unsafe path characters are sanitized before packaging."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoScenarioName"
                  initial={{
                    kind: "text",
                    value: "hku_deepmimo_roi",
                    defaultValue: "hku_deepmimo_roi",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="deepMimoRoiCenterX">
                <span className="paramLabel">
                  {"ROI Center X "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO ROI center X details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "ROI rectangle center X coordinate in the local scene frame. Updated when you draw or edit the ROI."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoRoiCenterX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoRoiCenterY">
                <span className="paramLabel">
                  {"ROI Center Y "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO ROI center Y details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "ROI rectangle center Y coordinate in the local scene frame. Updated when you draw or edit the ROI."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoRoiCenterY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoRoiWidth">
                <span className="paramLabel">
                  {"ROI Width "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO ROI width details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Rectangle span along local X. Larger areas create more receiver candidates and longer exports."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoRoiWidth"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.25",
                      step: "1.0",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoRoiLength">
                <span className="paramLabel">
                  {"ROI Length "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO ROI length details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Rectangle span along local Y. Larger areas create more receiver candidates and longer exports."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoRoiLength"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.25",
                      step: "1.0",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoGridSpacing">
                <span className="paramLabel">
                  {"Rx Spacing "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO Rx spacing details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Distance between generated receiver grid points. Smaller spacing creates denser datasets and higher runtime."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoGridSpacing"
                    initial={{
                      kind: "number",
                      value: "2.0",
                      defaultValue: "2.0",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.25",
                      max: "100",
                      step: "0.5",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoRxHeight">
                <span className="paramLabel">
                  {"Rx Height "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO Rx height details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Receiver height above the sampled terrain surface. The ROI footprint controls XY only."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoRxHeight"
                    initial={{
                      kind: "number",
                      value: "1.5",
                      defaultValue: "1.5",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "100",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label className="paramField" htmlFor="deepMimoMaxReceivers">
                <span className="paramLabel">
                  {"Max Receivers "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO max receivers details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Safety cap for generated receiver candidates. Increase only when the Rx Candidates count is intentional."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoMaxReceivers"
                  initial={{
                    kind: "number",
                    value: "30000",
                    defaultValue: "30000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "200000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="deepMimoChunkSize">
                <span className="paramLabel">
                  {"Chunk Size "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO chunk size details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Receivers traced per worker batch. Larger chunks reduce overhead but use more memory."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoChunkSize"
                  initial={{
                    kind: "number",
                    value: "1024",
                    defaultValue: "1024",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "8192",
                    step: "256",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="deepMimoSamplesPerSrc">
                <span className="paramLabel">
                  {"Samples / Source "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO samples per source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Monte Carlo rays per transmitter for each chunk. Higher values reduce noise and scale runtime."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoSamplesPerSrc"
                  initial={{
                    kind: "number",
                    value: "30000",
                    defaultValue: "30000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "1000000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="deepMimoMaxPaths">
                <span className="paramLabel">
                  {"Max Paths / Source "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO max paths per source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Upper bound on paths retained per solve. Higher values may preserve more multipath but use more memory."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoMaxPaths"
                  initial={{
                    kind: "number",
                    value: "1000000",
                    defaultValue: "1000000",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                    min: "1",
                    max: "1000000",
                    step: "1000",
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="paramField" htmlFor="deepMimoRxCandidates">
                <span className="paramLabel">
                  {"Rx Candidates "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO Rx candidates details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Read-only estimate of receiver grid points before building filtering."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="deepMimoRxCandidates"
                  initial={{
                    kind: "text",
                    value: "--",
                    defaultValue: "--",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: true,
                  }}
                  snapshot={snapshot}
                  ariaReadOnly
                  tabIndex={-1}
                />
              </label>
              <label className="paramCheck computeCheck">
                <SurfaceField
                  id="deepMimoFilterBuildings"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Filter building footprints "}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="DeepMIMO building footprint filter details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Drops receiver candidates inside building footprint boxes before terrain projection."
                      }
                    </span>
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>
      </div>
      <SurfaceNode
        id="linkPanel"
        tag="section"
        staticProps={{ className: "modePanel" }}
        snapshot={snapshot}
        leaf
      ></SurfaceNode>
      <SurfaceNode
        id="mobilityPanel"
        tag="section"
        staticProps={{ className: "modePanel hidden" }}
        snapshot={snapshot}
        leaf
      ></SurfaceNode>
      <SurfaceNode
        id="radiomapPanel"
        tag="section"
        staticProps={{ className: "modePanel hidden" }}
        snapshot={snapshot}
        leaf
      ></SurfaceNode>
      <SurfaceNode
        id="deepmimoPanel"
        tag="section"
        staticProps={{ className: "modePanel hidden" }}
        snapshot={snapshot}
        leaf
      ></SurfaceNode>
      <SurfaceNode
        id="radarPanel"
        tag="section"
        staticProps={{
          className: "modePanel radarOnlyParams hidden",
          "aria-label": "Radar sensing configuration",
        }}
        snapshot={snapshot}
      >
        <SurfaceNode
          id="radarJobBar"
          tag="div"
          staticProps={{
            className: "radarJobBar hidden",
            "data-status": "idle",
          }}
          snapshot={snapshot}
        >
          <div className="radarJobCopy">
            <SurfaceNode
              id="radarJobStatus"
              tag="span"
              staticProps={{ className: "radarStatusPill oat-badge" }}
              snapshot={snapshot}
              leaf
            >
              {"READY"}
            </SurfaceNode>
            <SurfaceNode
              id="radarJobMessage"
              tag="strong"
              staticProps={{}}
              snapshot={snapshot}
              leaf
            >
              {"Ready"}
            </SurfaceNode>
          </div>
          <SurfaceNode
            id="radarJobProgress"
            tag="progress"
            staticProps={{
              max: "1",
              value: "0",
              "aria-label": "Radar task progress",
            }}
            snapshot={snapshot}
            leaf
          ></SurfaceNode>
          <div className="radarJobActions">
            <SurfaceAction
              id="btnCancelRadar"
              tag="button"
              staticProps={{
                className: "oat-button oat-button--compact hidden",
                type: "button",
              }}
              snapshot={snapshot}
            >
              {"Cancel"}
            </SurfaceAction>
            <SurfaceAction
              id="btnRetryRadar"
              tag="button"
              staticProps={{
                className: "oat-button oat-button--compact hidden",
                type: "button",
              }}
              snapshot={snapshot}
            >
              {"Retry"}
            </SurfaceAction>
          </div>
        </SurfaceNode>
        <SurfaceDetails
          id="radarGeometryGroup"
          tag="details"
          staticProps={{ className: "paramGroup radarGroup" }}
          snapshot={snapshot}
        >
          <summary className="paramGroupSummary">{"Radar Geometry"}</summary>
          <div className="paramGroupBody radarGroupBody">
            <div
              className="radarModeSwitch"
              role="radiogroup"
              aria-label="Radar geometry"
            >
              <label className="oat-check">
                <SurfaceField
                  id="radarModeMonostatic"
                  initial={{
                    kind: "radio",
                    name: "radarMode",
                    value: "monostatic",
                    defaultValue: "monostatic",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                  name="radarMode"
                />
                {" Monostatic"}
              </label>
              <label className="oat-check">
                <SurfaceField
                  id="radarModeBistatic"
                  initial={{
                    kind: "radio",
                    name: "radarMode",
                    value: "bistatic",
                    defaultValue: "bistatic",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                  name="radarMode"
                />
                {" Bistatic"}
              </label>
            </div>
            <SurfaceNode
              id="radarModeHint"
              tag="p"
              staticProps={{ className: "radarHint" }}
              snapshot={snapshot}
              leaf
            >
              {"Tx and Rx are placed independently."}
            </SurfaceNode>
          </div>
        </SurfaceDetails>
        <SurfaceDetails
          id="radarTargetsGroup"
          tag="details"
          staticProps={{ className: "paramGroup radarGroup" }}
          snapshot={snapshot}
        >
          <summary className="paramGroupSummary">
            <span>{"Drone Targets"}</span>
            <span id="radarTargetCount" className="radarSummaryBadge oat-badge">
              {snapshot.radarTargetCount}
            </span>
          </summary>
          <div className="paramGroupBody radarGroupBody">
            <SurfaceNode
              id="radarAssetPicker"
              tag="div"
              staticProps={{
                className: "radarAssetPicker",
                "data-state": "loading",
                "aria-label": "New target model",
              }}
              snapshot={snapshot}
            >
              <div className="radarAssetPreviewViewport">
                <SurfaceNode
                  id="radarAssetPreviewCanvas"
                  tag="canvas"
                  staticProps={{
                    className: "radarAssetPreviewCanvas",
                    role: "img",
                    "aria-label": "Drone model preview",
                  }}
                  snapshot={snapshot}
                  leaf
                ></SurfaceNode>
                <SurfaceNode
                  id="radarAssetPreviewStatus"
                  tag="div"
                  staticProps={{
                    className: "radarAssetPreviewStatus",
                    role: "status",
                  }}
                  snapshot={snapshot}
                  leaf
                >
                  {"Loading drone models…"}
                </SurfaceNode>
                <SurfaceAction
                  id="btnRadarAssetPrevious"
                  tag="button"
                  staticProps={{
                    className: "radarAssetNav previous",
                    type: "button",
                    "aria-label": "Previous drone model",
                  }}
                  snapshot={snapshot}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 18-6-6 6-6"></path>
                  </svg>
                </SurfaceAction>
                <SurfaceAction
                  id="btnRadarAssetNext"
                  tag="button"
                  staticProps={{
                    className: "radarAssetNav next",
                    type: "button",
                    "aria-label": "Next drone model",
                  }}
                  snapshot={snapshot}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 18 6-6-6-6"></path>
                  </svg>
                </SurfaceAction>
              </div>
              <div className="radarAssetPickerMeta">
                <div>
                  <span>{"New Target Model"}</span>
                  <SurfaceNode
                    id="radarAssetPreviewName"
                    tag="strong"
                    staticProps={{ "aria-live": "polite" }}
                    snapshot={snapshot}
                    leaf
                  >
                    {"Loading…"}
                  </SurfaceNode>
                </div>
                <SurfaceNode
                  id="radarAssetPreviewCount"
                  tag="span"
                  staticProps={{ className: "radarAssetPreviewCount" }}
                  snapshot={snapshot}
                  leaf
                >
                  {"0 / 0"}
                </SurfaceNode>
              </div>
              <SurfaceAction
                id="btnAddRadarTarget"
                tag="button"
                staticProps={{
                  className:
                    "oat-button oat-button--compact oat-button--primary oat-button--block radarAssetAddButton",
                  type: "button",
                  disabled: true,
                }}
                snapshot={snapshot}
              >
                {"Add Target"}
              </SurfaceAction>
              <div
                className="radarEditorActions"
                role="group"
                aria-label="Selected target actions"
              >
                <SurfaceAction
                  id="btnPickRadarTarget"
                  tag="button"
                  staticProps={{
                    className:
                      "oat-button oat-button--compact oat-button--toolbar",
                    type: "button",
                  }}
                  snapshot={snapshot}
                >
                  {"Pick in 3D"}
                </SurfaceAction>
                <SurfaceAction
                  id="btnFocusRadarTarget"
                  tag="button"
                  staticProps={{
                    className:
                      "oat-button oat-button--compact oat-button--toolbar",
                    type: "button",
                  }}
                  snapshot={snapshot}
                >
                  {"Focus Target"}
                </SurfaceAction>
                <SurfaceAction
                  id="btnRemoveRadarTarget"
                  tag="button"
                  staticProps={{
                    className:
                      "oat-button oat-button--compact oat-button--toolbar oat-button--danger",
                    type: "button",
                  }}
                  snapshot={snapshot}
                >
                  {"Remove Target"}
                </SurfaceAction>
              </div>
              <SurfaceNode
                id="radarAssetPickerHint"
                tag="p"
                staticProps={{ className: "radarAssetPickerHint" }}
                snapshot={snapshot}
                leaf
              >
                {"Drag to rotate the 3D preview."}
              </SurfaceNode>
            </SurfaceNode>
            <RadarTargetList targets={snapshot.radarTargets} />
            <SurfaceNode
              id="radarTargetEditor"
              tag="div"
              staticProps={{ className: "radarTargetEditor" }}
              snapshot={snapshot}
            >
              <div className="radarEditorHead">
                <SurfaceNode
                  id="radarEditorTitle"
                  tag="strong"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"Target"}
                </SurfaceNode>
                <SurfaceNode
                  id="radarEditorAssetName"
                  tag="span"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"--"}
                </SurfaceNode>
              </div>
              <label
                className="radarField radarWide"
                htmlFor="radarTargetAsset"
              >
                <span className="radarFieldLabel">{"Drone Model"}</span>
                <SurfaceField
                  id="radarTargetAsset"
                  initial={{
                    kind: "select",
                    value: "",
                    defaultValue: "",
                    defaultSelectedValue: "",
                    separateOptions: false,
                    disabled: false,
                    options: [],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <div className="radarVectorLabel">{"Position"}</div>
              <div className="radarVectorGrid">
                <label className="radarField oat-field" htmlFor="radarTargetX">
                  <span className="radarFieldLabel">{"X"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetX"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        step: "0.1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"m"}
                    </span>
                  </span>
                </label>
                <label className="radarField oat-field" htmlFor="radarTargetY">
                  <span className="radarFieldLabel">{"Y"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetY"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        step: "0.1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"m"}
                    </span>
                  </span>
                </label>
                <label className="radarField oat-field" htmlFor="radarTargetZ">
                  <span className="radarFieldLabel">{"Z"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetZ"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        step: "0.1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"m"}
                    </span>
                  </span>
                </label>
              </div>
              <div className="radarVectorLabel">{"Attitude"}</div>
              <div className="radarVectorGrid">
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetRoll"
                >
                  <span className="radarFieldLabel">{"Roll"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetRoll"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        step: "1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"°"}
                    </span>
                  </span>
                </label>
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetPitch"
                >
                  <span className="radarFieldLabel">{"Pitch"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetPitch"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        step: "1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"°"}
                    </span>
                  </span>
                </label>
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetYaw"
                >
                  <span className="radarFieldLabel">
                    {"Yaw"}
                    <span
                      className="infoTip"
                      tabIndex={0}
                      aria-label="Yaw details"
                    >
                      {"i"}
                      <span className="tipBubble" role="tooltip">
                        {"Automatically follows the X–Y motion direction."}
                      </span>
                    </span>
                  </span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetYaw"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: true,
                        step: "1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                      ariaReadOnly
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"°"}
                    </span>
                  </span>
                </label>
              </div>
              <div className="radarVectorLabel">{"Motion"}</div>
              <div className="radarVectorGrid radarVelocityGrid">
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetSpeed"
                >
                  <span className="radarFieldLabel">{"Speed"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetSpeed"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        min: "0",
                        max: "500",
                        step: "0.1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"m/s"}
                    </span>
                  </span>
                </label>
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetDirection"
                >
                  <span className="radarFieldLabel">{"Direction"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetDirection"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        min: "-180",
                        max: "360",
                        step: "1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"°"}
                    </span>
                  </span>
                </label>
                <label
                  className="radarField oat-field"
                  htmlFor="radarTargetClimb"
                >
                  <span className="radarFieldLabel">{"Climb"}</span>
                  <span className="unitInput">
                    <SurfaceField
                      id="radarTargetClimb"
                      initial={{
                        kind: "number",
                        value: "0",
                        defaultValue: "0",
                        checked: false,
                        defaultChecked: false,
                        disabled: false,
                        readOnly: false,
                        min: "-90",
                        max: "90",
                        step: "1",
                      }}
                      snapshot={snapshot}
                      className="oat-input"
                    />
                    <span className="unitSuffix" aria-hidden="true">
                      {"°"}
                    </span>
                  </span>
                </label>
              </div>
              <div className="radarVelocityMeta">
                <span>{"0° = +X · 90° = +Y · Yaw follows Direction"}</span>
                <SurfaceNode
                  id="radarVelocityVectorPreview"
                  tag="span"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"Velocity [0.0, 0.0, 0.0] m/s"}
                </SurfaceNode>
              </div>
              <label className="radarField oat-field" htmlFor="radarTargetRcs">
                <span className="radarFieldLabel">
                  {"Effective RCS"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Effective RCS details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Effective radar cross section used to scale the target echo power."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarTargetRcs"
                    initial={{
                      kind: "number",
                      value: "0.01",
                      defaultValue: "0.01",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.000001",
                      max: "1000000",
                      step: "0.001",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m²"}
                  </span>
                </span>
              </label>
            </SurfaceNode>
          </div>
        </SurfaceDetails>
        <SurfaceDetails
          id="radarWaveformGroup"
          tag="details"
          staticProps={{ className: "paramGroup radarGroup" }}
          snapshot={snapshot}
        >
          <summary className="paramGroupSummary">{"OFDM Waveform"}</summary>
          <div className="paramGroupBody radarGroupBody">
            <div className="radarFieldGrid">
              <label
                className="radarField oat-field"
                htmlFor="radarCarrierFrequency"
              >
                <span className="radarFieldLabel">
                  {"Carrier Frequency"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Carrier Frequency details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "RF carrier used for wavelength, propagation, and Doppler calculations."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCarrierFrequency"
                    initial={{
                      kind: "number",
                      value: "5.8",
                      defaultValue: "5.8",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.1",
                      max: "300",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"GHz"}
                  </span>
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarBandwidth">
                <span className="radarFieldLabel">
                  {"Bandwidth"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Bandwidth details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Occupied OFDM bandwidth. Wider bandwidth improves equivalent range resolution."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarBandwidth"
                    initial={{
                      kind: "number",
                      value: "128",
                      defaultValue: "128",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0.001",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"MHz"}
                  </span>
                </span>
              </label>
              <label className="radarField" htmlFor="radarNumSubcarriers">
                <span className="radarFieldLabel">
                  {"OFDM Subcarriers"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="OFDM subcarriers details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of frequency bins in each OFDM symbol. Together with bandwidth, this sets subcarrier spacing."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="radarNumSubcarriers"
                  textBoundary="joined"
                  initial={{
                    kind: "select",
                    value: "1024",
                    defaultValue: "1024",
                    defaultSelectedValue: "1024",
                    separateOptions: false,
                    disabled: false,
                    options: [
                      { label: "16", value: "16", disabled: false },
                      { label: "32", value: "32", disabled: false },
                      { label: "64", value: "64", disabled: false },
                      { label: "128", value: "128", disabled: false },
                      { label: "256", value: "256", disabled: false },
                      { label: "512", value: "512", disabled: false },
                      { label: "1024", value: "1024", disabled: false },
                      { label: "2048", value: "2048", disabled: false },
                    ],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="radarField" htmlFor="radarNumSymbols">
                <span className="radarFieldLabel">
                  {"OFDM Symbols"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="OFDM symbols details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Number of slow-time symbols used for Doppler processing. More symbols improve Doppler resolution and increase processing cost."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceField
                  id="radarNumSymbols"
                  textBoundary="joined"
                  initial={{
                    kind: "select",
                    value: "1024",
                    defaultValue: "1024",
                    defaultSelectedValue: "1024",
                    separateOptions: false,
                    disabled: false,
                    options: [
                      { label: "8", value: "8", disabled: false },
                      { label: "16", value: "16", disabled: false },
                      { label: "32", value: "32", disabled: false },
                      { label: "64", value: "64", disabled: false },
                      { label: "128", value: "128", disabled: false },
                      { label: "256", value: "256", disabled: false },
                      { label: "512", value: "512", disabled: false },
                      { label: "1024", value: "1024", disabled: false },
                    ],
                  }}
                  snapshot={snapshot}
                />
              </label>
              <label className="radarField oat-field" htmlFor="radarTxPower">
                <span className="radarFieldLabel">
                  {"Tx Power"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Tx Power details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Total transmitted radar power used in the received-power and SNR calculation."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarTxPower"
                    initial={{
                      kind: "number",
                      value: "30",
                      defaultValue: "30",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "-100",
                      max: "100",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"dBm"}
                  </span>
                </span>
              </label>
              <label
                className="radarField oat-field"
                htmlFor="radarNoiseFigure"
              >
                <span className="radarFieldLabel">
                  {"Noise Figure"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Noise Figure details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Receiver noise figure added to thermal noise when calculating the detection SNR."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarNoiseFigure"
                    initial={{
                      kind: "number",
                      value: "7",
                      defaultValue: "7",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "100",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"dB"}
                  </span>
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarSystemLoss">
                <span className="radarFieldLabel">
                  {"System Loss"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="System Loss details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Aggregate implementation and hardware loss applied to the received signal."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarSystemLoss"
                    initial={{
                      kind: "number",
                      value: "3",
                      defaultValue: "3",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "100",
                      step: "0.1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"dB"}
                  </span>
                </span>
              </label>
              <label
                className="radarField oat-field"
                htmlFor="radarNoiseTemperature"
              >
                <span className="radarFieldLabel">
                  {"Noise Temperature"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Noise Temperature details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "System noise temperature used to calculate thermal noise power."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarNoiseTemperature"
                    initial={{
                      kind: "number",
                      value: "290",
                      defaultValue: "290",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1",
                      max: "1000",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"K"}
                  </span>
                </span>
              </label>
            </div>
            <label className="radarCheck">
              <SurfaceField
                id="radarDirectPathCancellation"
                initial={{
                  kind: "checkbox",
                  value: "on",
                  defaultValue: "",
                  checked: true,
                  defaultChecked: true,
                  disabled: false,
                  readOnly: false,
                }}
                snapshot={snapshot}
              />
              <span>
                {"Cancel known direct Tx–Rx leakage"}
                <span
                  className="infoTip"
                  tabIndex={0}
                  aria-label="Direct path cancellation details"
                >
                  {"i"}
                  <span className="tipBubble" role="tooltip">
                    {
                      "Removes the modeled direct transmitter-to-receiver path before OFDM processing so it does not mask weaker target echoes."
                    }
                  </span>
                </span>
              </span>
            </label>
            <div className="radarDerived">
              <span>
                <span className="radarDerivedLabel">
                  <span>
                    {"Range"}
                    <br />
                    {"Resolution"}
                  </span>
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Range resolution details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Equivalent range-bin spacing derived from the configured bandwidth."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceNode
                  id="radarRangeResolutionPreview"
                  tag="b"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"--"}
                </SurfaceNode>
              </span>
              <span>
                <span className="radarDerivedLabel">
                  <span>
                    {"Doppler"}
                    <br />
                    {"Resolution"}
                  </span>
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Doppler resolution details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Doppler-bin spacing derived from subcarrier spacing and the number of OFDM symbols."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceNode
                  id="radarDopplerResolutionPreview"
                  tag="b"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"--"}
                </SurfaceNode>
              </span>
              <span>
                <span className="radarDerivedLabel">
                  <span>
                    {"Velocity"}
                    <br />
                    {"Resolution"}
                  </span>
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Velocity resolution details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Equivalent radial-velocity spacing derived from Doppler resolution and carrier wavelength."
                      }
                    </span>
                  </span>
                </span>
                <SurfaceNode
                  id="radarVelocityResolutionPreview"
                  tag="b"
                  staticProps={{}}
                  snapshot={snapshot}
                  leaf
                >
                  {"--"}
                </SurfaceNode>
              </span>
            </div>
          </div>
        </SurfaceDetails>
        <SurfaceDetails
          id="radarCfarGroup"
          tag="details"
          staticProps={{ className: "paramGroup radarGroup" }}
          snapshot={snapshot}
        >
          <summary className="paramGroupSummary">{"CA-CFAR Detection"}</summary>
          <div className="paramGroupBody radarGroupBody">
            <label className="radarCheck">
              <SurfaceField
                id="radarCfarEnabled"
                initial={{
                  kind: "checkbox",
                  value: "on",
                  defaultValue: "",
                  checked: true,
                  defaultChecked: true,
                  disabled: false,
                  readOnly: false,
                }}
                snapshot={snapshot}
              />
              {" Enable CA-CFAR detections"}
            </label>
            <div className="radarFieldGrid">
              <label
                className="radarField oat-field"
                htmlFor="radarCfarGuardRange"
              >
                <span className="radarFieldLabel">
                  {"Range Guard Cells"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Range Guard Cells details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Range cells excluded around the cell under test so target energy does not bias the noise estimate."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCfarGuardRange"
                    initial={{
                      kind: "number",
                      value: "1",
                      defaultValue: "1",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "64",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label
                className="radarField oat-field"
                htmlFor="radarCfarGuardDoppler"
              >
                <span className="radarFieldLabel">
                  {"Doppler Guard Cells"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Doppler Guard Cells details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {"Doppler cells excluded around the cell under test."}
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCfarGuardDoppler"
                    initial={{
                      kind: "number",
                      value: "1",
                      defaultValue: "1",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "64",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label
                className="radarField oat-field"
                htmlFor="radarCfarTrainingRange"
              >
                <span className="radarFieldLabel">
                  {"Range Training Cells"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Range Training Cells details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Range cells sampled on each side to estimate the local clutter and noise level."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCfarTrainingRange"
                    initial={{
                      kind: "number",
                      value: "2",
                      defaultValue: "2",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1",
                      max: "128",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label
                className="radarField oat-field"
                htmlFor="radarCfarTrainingDoppler"
              >
                <span className="radarFieldLabel">
                  {"Doppler Training Cells"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Doppler Training Cells details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Doppler cells sampled on each side to estimate the local clutter and noise level."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCfarTrainingDoppler"
                    initial={{
                      kind: "number",
                      value: "4",
                      defaultValue: "4",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1",
                      max: "128",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarCfarPfa">
                <span className="radarFieldLabel">
                  {"False-alarm Probability (Pfa)"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="False-alarm Probability (Pfa) details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Desired probability of false alarm used to derive the CA-CFAR detection threshold."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarCfarPfa"
                    initial={{
                      kind: "number",
                      value: "1e-8",
                      defaultValue: "1e-8",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1e-12",
                      max: "0.1",
                      step: "1e-8",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
            </div>
          </div>
        </SurfaceDetails>
        <SurfaceDetails
          id="radarPropagationGroup"
          tag="details"
          staticProps={{ className: "paramGroup radarGroup" }}
          snapshot={snapshot}
        >
          <summary className="paramGroupSummary">
            {"Propagation Solver"}
          </summary>
          <div className="paramGroupBody radarGroupBody">
            <div className="radarFieldGrid">
              <label
                className="radarField oat-field"
                htmlFor="radarSamplesPerSrc"
              >
                <span className="radarFieldLabel">
                  {"Samples / Source"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Samples / Source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Monte Carlo rays launched per source. Higher values reduce sampling noise and increase runtime."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarSamplesPerSrc"
                    initial={{
                      kind: "number",
                      value: "65536",
                      defaultValue: "65536",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1",
                      max: "1000000",
                      step: "256",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarMaxPaths">
                <span className="radarFieldLabel">
                  {"Max Paths / Source"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Max Paths / Source details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Maximum number of propagation paths retained per source."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarMaxPaths"
                    initial={{
                      kind: "number",
                      value: "4096",
                      defaultValue: "4096",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "1",
                      max: "1000000",
                      step: "256",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarMaxDepth">
                <span className="radarFieldLabel">
                  {"Max Depth"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Max Depth details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Maximum number of propagation interactions allowed for each path."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarMaxDepth"
                    initial={{
                      kind: "number",
                      value: "2",
                      defaultValue: "2",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "20",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
              <label className="radarField oat-field" htmlFor="radarSeed">
                <span className="radarFieldLabel">
                  {"Seed"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Seed details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Random seed for repeatable ray sampling and clutter results."
                      }
                    </span>
                  </span>
                </span>
                <span className="unitInput">
                  <SurfaceField
                    id="radarSeed"
                    initial={{
                      kind: "number",
                      value: "42",
                      defaultValue: "42",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      min: "0",
                      max: "2147483647",
                      step: "1",
                    }}
                    snapshot={snapshot}
                    className="oat-input"
                  />
                </span>
              </label>
            </div>
            <div className="radarCheckGrid">
              <label className="radarCheck">
                <SurfaceField
                  id="radarLos"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"LoS"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Line of sight details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Includes unobstructed propagation paths between Radar devices and scene objects."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="radarCheck">
                <SurfaceField
                  id="radarSpecular"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Specular"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Specular reflection details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {"Includes mirror-like reflections from scene surfaces."}
                    </span>
                  </span>
                </span>
              </label>
              <label className="radarCheck">
                <SurfaceField
                  id="radarDiffuse"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Diffuse"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Diffuse reflection details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Includes rough-surface scattering used to model environmental clutter."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="radarCheck">
                <SurfaceField
                  id="radarRefraction"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: true,
                    defaultChecked: true,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Refraction"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Refraction details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Includes transmission through supported scene materials."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="radarCheck">
                <SurfaceField
                  id="radarDiffraction"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Diffraction"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Diffraction details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Includes bending around wedges and edges. This can improve NLoS coverage and increase solve time."
                      }
                    </span>
                  </span>
                </span>
              </label>
              <label className="radarCheck">
                <SurfaceField
                  id="radarSyntheticArray"
                  initial={{
                    kind: "checkbox",
                    value: "on",
                    defaultValue: "",
                    checked: false,
                    defaultChecked: false,
                    disabled: false,
                    readOnly: false,
                  }}
                  snapshot={snapshot}
                />
                <span>
                  {"Synthetic Array"}
                  <span
                    className="infoTip"
                    tabIndex={0}
                    aria-label="Synthetic Array details"
                  >
                    {"i"}
                    <span className="tipBubble" role="tooltip">
                      {
                        "Uses a synthetic-array approximation for array studies."
                      }
                    </span>
                  </span>
                </span>
              </label>
            </div>
          </div>
        </SurfaceDetails>
        <SurfaceNode
          id="radarInputError"
          tag="p"
          staticProps={{ className: "radarInputError hidden", role: "alert" }}
          snapshot={snapshot}
          leaf
        ></SurfaceNode>
      </SurfaceNode>
    </>
  );
}

function DeviceControls({
  snapshot,
}: {
  readonly snapshot: WorkbenchControlsSnapshot;
}) {
  return (
    <>
      <SurfaceNode
        id="devicePrecisionPanel"
        tag="div"
        staticProps={{
          className: "devicePrecisionPanel deviceCompactBar hidden",
          "aria-hidden": "true",
        }}
        snapshot={snapshot}
      >
        <div className="devicePrecisionHead">
          <SurfaceNode
            id="devicePrecisionTitle"
            tag="div"
            staticProps={{ className: "devicePrecisionTitle" }}
            snapshot={snapshot}
            leaf
          >
            {"Tx"}
          </SurfaceNode>
          <SurfaceNode
            id="hintText"
            tag="div"
            staticProps={{
              className: "devicePrecisionStatus",
              "aria-live": "polite",
            }}
            snapshot={snapshot}
            leaf
          >
            {"Pick a surface point or fine-tune below."}
          </SurfaceNode>
        </div>
        <div className="deviceCoordPanels">
          <SurfaceNode
            id="linkTxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkTxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkTxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkTxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="linkRxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkRxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkRxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="linkRxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="mobilityTxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityTxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityTxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityTxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="mobilityRxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityRxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityRxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="mobilityRxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="rmTxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="rmTxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="rmTxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="rmTxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="deepMimoTxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoTxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoTxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="deepMimoTxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1.0",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix" aria-hidden="true">
                    {"m"}
                  </span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="radarTxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarTxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarTxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarTxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="radarRxDeviceCard"
            tag="section"
            staticProps={{ className: "deviceCoordPanel hidden" }}
            snapshot={snapshot}
          >
            <div className="deviceCoordGrid">
              <label>
                {"X "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarRxX"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
              <label>
                {"Y "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarRxY"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
              <label>
                {"Z "}
                <span className="unitInput">
                  <SurfaceField
                    id="radarRxZ"
                    initial={{
                      kind: "number",
                      value: "",
                      defaultValue: "",
                      checked: false,
                      defaultChecked: false,
                      disabled: false,
                      readOnly: false,
                      step: "1",
                      placeholder: "—",
                    }}
                    snapshot={snapshot}
                  />
                  <span className="unitSuffix">{"m"}</span>
                </span>
              </label>
            </div>
          </SurfaceNode>
          <SurfaceNode
            id="linkSurfaceClearanceField"
            tag="label"
            staticProps={{
              className: "deviceClearanceField hidden",
              htmlFor: "linkSurfaceClearance",
            }}
            snapshot={snapshot}
          >
            <span>
              {"Clearance\n              "}
              <span
                className="infoTip"
                tabIndex={0}
                aria-label="Surface clearance details"
              >
                {"i"}
                <span className="tipBubble" role="tooltip">
                  {
                    "Distance from the picked surface for the active mode device. Applies to the next click or drag placement only."
                  }
                </span>
              </span>
            </span>
            <span className="unitInput">
              <SurfaceField
                id="linkSurfaceClearance"
                initial={{
                  kind: "number",
                  value: "1.5",
                  defaultValue: "1.5",
                  checked: false,
                  defaultChecked: false,
                  disabled: false,
                  readOnly: false,
                  min: "0",
                  max: "50",
                  step: "0.1",
                }}
                snapshot={snapshot}
              />
              <span className="unitSuffix" aria-hidden="true">
                {"m"}
              </span>
            </span>
          </SurfaceNode>
        </div>
      </SurfaceNode>
      <SurfaceNode
        id="deviceActionBar"
        tag="div"
        staticProps={{
          className: "deviceActionBar",
          role: "group",
          "aria-label": "Device controls",
        }}
        snapshot={snapshot}
      >
        <SurfaceAction
          id="btnPickLinkTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn",
            type: "button",
            "aria-label": "Pick link transmitter",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M7 9a5 5 0 0 1 10 0"></path>
              <path d="M4 6a9 9 0 0 1 16 0"></path>
              <path d="M10 21h4"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Tx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickLinkRx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn",
            type: "button",
            "aria-label": "Pick link receiver",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M17 9a5 5 0 0 0-10 0"></path>
              <path d="M20 6A9 9 0 0 0 4 6"></path>
              <path d="M9 21h6"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Rx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickMobilityTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Pick mobility transmitter",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M7 9a5 5 0 0 1 10 0"></path>
              <path d="M4 6a9 9 0 0 1 16 0"></path>
              <path d="M10 21h4"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Tx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickMobilityRx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Pick mobility receiver",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M17 9a5 5 0 0 0-10 0"></path>
              <path d="M20 6A9 9 0 0 0 4 6"></path>
              <path d="M9 21h6"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Rx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickRmTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Pick radio map transmitter",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M7 9a5 5 0 0 1 10 0"></path>
              <path d="M4 6a9 9 0 0 1 16 0"></path>
              <path d="M10 21h4"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Tx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnDeepMimoPickTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Pick DeepMIMO transmitter",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M7 9a5 5 0 0 1 10 0"></path>
              <path d="M4 6a9 9 0 0 1 16 0"></path>
              <path d="M10 21h4"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Tx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnDeepMimoPickRoi"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Draw DeepMIMO ROI",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 5h14v14H5z"></path>
              <path d="M9 5v14"></path>
              <path d="M15 5v14"></path>
              <path d="M5 9h14"></path>
              <path d="M5 15h14"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Draw ROI"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnDeepMimoClearRoi"
          tag="button"
          staticProps={{
            className: "deviceActionBtn hidden",
            type: "button",
            "aria-label": "Clear DeepMIMO ROI",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 7h10"></path>
              <path d="M9 7V5h6v2"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
              <path d="M8 7l1 12h6l1-12"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Clear ROI"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnOrbitTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn",
            type: "button",
            "aria-label": "Orbit around transmitter",
            "aria-pressed": "false",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 12a8 5 0 1 0 16 0 8 5 0 1 0-16 0"></path>
              <path d="M12 7v10"></path>
              <path d="m9 14 3 3 3-3"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Orbit"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnSolveLink"
          tag="button"
          staticProps={{ className: "deviceActionBtn solve", type: "button" }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m6 17 5-5-5-5"></path>
              <path d="M13 17h5"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Solve Link"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnRunMobility"
          tag="button"
          staticProps={{
            className: "deviceActionBtn solve hidden",
            type: "button",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 18c4-10 10-14 14-12"></path>
              <path d="M17 6h2v2"></path>
              <path d="M6 18h.01"></path>
              <path d="M12 11h.01"></path>
              <path d="M18 6h.01"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Run Mobility"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnRunRadiomap"
          tag="button"
          staticProps={{
            className: "deviceActionBtn solve hidden",
            type: "button",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 18c4-4 12 4 16 0"></path>
              <path d="M4 12c4-4 12 4 16 0"></path>
              <path d="M4 6c4-4 12 4 16 0"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Run Map"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnRunDeepMimo"
          tag="button"
          staticProps={{
            className: "deviceActionBtn solve hidden",
            type: "button",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 7h16"></path>
              <path d="M4 12h16"></path>
              <path d="M4 17h16"></path>
              <path d="M7 4v16"></path>
              <path d="M12 4v16"></path>
              <path d="M17 4v16"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Export Data"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickRadarTx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn radarDevicePick hidden",
            type: "button",
            "aria-label": "Pick radar transmitter",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M7 9a5 5 0 0 1 10 0"></path>
              <path d="M4 6a9 9 0 0 1 16 0"></path>
              <path d="M10 21h4"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Tx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnPickRadarRx"
          tag="button"
          staticProps={{
            className: "deviceActionBtn radarDevicePick hidden",
            type: "button",
            "aria-label": "Pick radar receiver",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 19v-7"></path>
              <path d="M17 9a5 5 0 0 0-10 0"></path>
              <path d="M20 6A9 9 0 0 0 4 6"></path>
              <path d="M9 21h6"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Rx"}</span>
        </SurfaceAction>
        <SurfaceAction
          id="btnSolveRadar"
          tag="button"
          staticProps={{
            className: "deviceActionBtn solve radarDeviceRun hidden",
            type: "button",
          }}
          snapshot={snapshot}
        >
          <span className="deviceActionIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M5.6 8.2a7 7 0 0 0 0 7.6"></path>
              <path d="M18.4 8.2a7 7 0 0 1 0 7.6"></path>
              <path d="M2.7 5.2a11 11 0 0 0 0 13.6"></path>
              <path d="M21.3 5.2a11 11 0 0 1 0 13.6"></path>
            </svg>
          </span>
          <span className="deviceActionText">{"Run Radar"}</span>
        </SurfaceAction>
      </SurfaceNode>
    </>
  );
}

export function ControlSurface({
  section,
  store,
}: {
  readonly section: "form" | "device";
  readonly store: UiExternalStore<WorkbenchControlsSnapshot>;
}) {
  const snapshot = useFeatureSnapshot(store);
  return section === "form" ? (
    <ControlForm snapshot={snapshot} />
  ) : (
    <DeviceControls snapshot={snapshot} />
  );
}
