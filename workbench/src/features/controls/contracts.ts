import type { UiCommand } from "../../runtime/ui-command.ts";

export type WorkbenchFeatureId =
  "link" | "mobility" | "radiomap" | "deepmimo" | "radar";

export type ControlFieldKind =
  "number" | "text" | "select" | "checkbox" | "radio" | "hidden";

export interface ControlOption {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
}

export interface ControlFieldViewModel {
  readonly kind: ControlFieldKind;
  readonly name?: string;
  readonly value: string;
  readonly defaultValue: string;
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly defaultSelectedValue?: string;
  readonly separateOptions?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly invalid?: boolean;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
  readonly placeholder?: string;
  readonly options?: readonly ControlOption[];
}

export interface ControlFieldPatch {
  readonly id: string;
  readonly value?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
}

export interface ControlNodeViewModel {
  readonly className: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly progressValue?: number;
}

export interface MobilityWaypointViewModel {
  readonly index: number;
  readonly coordinate: string;
  readonly selected: boolean;
}

export interface RadarTargetControlViewModel {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly selected: boolean;
}

export interface ControlActionViewModel {
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly busy?: boolean;
  readonly active?: boolean;
  readonly picking?: boolean;
  readonly title?: string;
  readonly label?: string;
}

export interface DeviceDockViewModel {
  readonly visible: boolean;
  readonly precisionVisible: boolean;
  readonly precisionTitle: string;
  readonly activeTarget: string | null;
  readonly pickTarget: string | null;
  readonly clearanceVisible: boolean;
  readonly hint: string;
  readonly actions: Readonly<Record<string, ControlActionViewModel>>;
}

export interface RadarJobViewModel {
  readonly visible: boolean;
  readonly status: string;
  readonly statusLabel: string;
  readonly message: string;
  readonly progress: number;
  readonly cancelVisible: boolean;
  readonly retryVisible: boolean;
}

export interface RadarAssetPickerViewModel {
  readonly state: string;
  readonly status: string;
  readonly name: string;
  readonly count: string;
  readonly addDisabled: boolean;
  readonly navigationDisabled: boolean;
}

export interface RadarTargetEditorViewModel {
  readonly empty: boolean;
  readonly title: string;
  readonly assetName: string;
  readonly velocityPreview: string;
  readonly controlsDisabled: boolean;
}

export interface WorkbenchControlsSnapshot {
  readonly activeMode: WorkbenchFeatureId;
  readonly fields: Readonly<Record<string, ControlFieldViewModel>>;
  readonly nodes: Readonly<Record<string, ControlNodeViewModel>>;
  readonly mobilityWaypoints: readonly MobilityWaypointViewModel[];
  readonly mobilityEstimate: string;
  readonly deepMimoReceiverEstimate: string;
  readonly deviceDock: DeviceDockViewModel;
  readonly radarJob: RadarJobViewModel;
  readonly radarAssetPicker: RadarAssetPickerViewModel;
  readonly radarTargets: readonly RadarTargetControlViewModel[];
  readonly radarTargetCount: string;
  readonly radarTargetEditor: RadarTargetEditorViewModel;
  readonly radarModeHint: string;
  readonly radarRangeResolution: string;
  readonly radarDopplerResolution: string;
  readonly radarVelocityResolution: string;
  readonly radarInputError: string;
}

export type ControlFieldDraftCommand = UiCommand<
  "workbench.control.draft",
  {
    readonly controlId: string;
    readonly value: string;
    readonly checked?: boolean;
  }
>;

export type ControlFieldCommitCommand = UiCommand<
  "workbench.control.commit",
  {
    readonly controlId: string;
    readonly value: string;
    readonly checked?: boolean;
  }
>;

export type ControlActionCommand = UiCommand<
  "workbench.control.action",
  { readonly actionId: string; readonly value?: string | number }
>;

export type ControlGroupToggleCommand = UiCommand<
  "workbench.control.group.toggle",
  { readonly controlId: string; readonly open: boolean }
>;

export type WorkbenchControlCommand =
  | ControlFieldDraftCommand
  | ControlFieldCommitCommand
  | ControlActionCommand
  | ControlGroupToggleCommand;

export function controlDraftCommand(
  controlId: string,
  value: string,
  checked?: boolean,
): ControlFieldDraftCommand {
  return {
    name: "workbench.control.draft",
    payload:
      checked === undefined
        ? { controlId, value }
        : { controlId, value, checked },
  };
}

export function controlCommitCommand(
  controlId: string,
  value: string,
  checked?: boolean,
): ControlFieldCommitCommand {
  return {
    name: "workbench.control.commit",
    payload:
      checked === undefined
        ? { controlId, value }
        : { controlId, value, checked },
  };
}

export function controlActionCommand(
  actionId: string,
  value?: string | number,
): ControlActionCommand {
  return {
    name: "workbench.control.action",
    payload: value === undefined ? { actionId } : { actionId, value },
  };
}

export function controlGroupToggleCommand(
  controlId: string,
  open: boolean,
): ControlGroupToggleCommand {
  return {
    name: "workbench.control.group.toggle",
    payload: { controlId, open },
  };
}
