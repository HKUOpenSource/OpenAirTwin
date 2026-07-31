export type FeatureId = "link" | "mobility" | "radiomap" | "deepmimo" | "radar" | (string & {});
export type CapabilityId = string;
export type SettingId = string;
export type UiRefName = string;
export type UiRef<TElement extends Element = HTMLElement> = TElement | null;
export type UiRefMap = Readonly<Record<UiRefName, UiRef<Element>>>;
export type TemplateFragments = Readonly<Record<string, string>>;

export interface UiViewModel {
  readonly status: "idle" | "loading" | "success" | "empty" | "cancelled" | "error" | "stale";
  readonly busy?: boolean;
  readonly error?: string | null;
}

export interface UiCommand<TName extends string = string, TPayload = undefined> {
  readonly name: TName;
  readonly featureId?: FeatureId;
  readonly payload: TPayload;
}

export type CommandHandler<TCommand extends UiCommand = UiCommand> = (
  command: TCommand,
) => void | Promise<void>;

export interface FeatureLifecycleContext<TState = unknown> {
  readonly definition: FeatureDefinition<TState>;
  readonly state: unknown;
  readonly featureState: TState;
  readonly dom: UiRefMap;
}

export interface FeatureLifecycle<TState = unknown> {
  attachEvents?(context: FeatureLifecycleContext<TState>): void;
  activate?(context: FeatureLifecycleContext<TState>): void;
  deactivate?(context: FeatureLifecycleContext<TState>): void;
  render?(context: FeatureLifecycleContext<TState>): void;
  onSettingsChanged?(setting: SettingId, detail: Readonly<Record<string, unknown>>): void;
  closeTransientUi?(): void;
  dispose?(context: FeatureLifecycleContext<TState>): void;
}

export interface FeatureUiContract {
  readonly tabRef: UiRefName;
  readonly panelRef: UiRefName;
  readonly runButtonRef: UiRefName;
  readonly disableDuringTileLoad?: boolean;
  readonly parameterGroups?: readonly UiRefName[];
  readonly filteredParameterGroups?: readonly Readonly<{ref: UiRefName; className: string}>[];
  readonly extraActionButtonRefs?: readonly UiRefName[];
  readonly resultMethod: string;
}

export interface PickingTargetDefinition {
  readonly id: string;
  readonly role: "tx" | "rx" | "roi" | "target" | string;
  readonly scope: FeatureId;
  readonly prompt: string;
  readonly buttonRef: UiRefName;
  readonly cardRef?: UiRefName;
  readonly precisionTitle?: string;
  readonly precision?: boolean;
  readonly clearance?: boolean;
  readonly readMethod: string;
  readonly applyMethod: string;
  readonly pointerAdapter?: string;
}

export interface FeatureFactoryContext<
  TState = unknown,
  TTransport = unknown,
  TResultView = unknown,
  TController = unknown,
  TRenderer = unknown,
> extends FeatureLifecycleContext<TState> {
  readonly documentRoot?: Document;
  readonly ui: Readonly<Record<string, UiRef<Element> | readonly Element[]>>;
  readonly inputs: Readonly<Record<string, UiRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>>>;
  readonly transport: TTransport;
  readonly resultView: TResultView;
  readonly controller: TController;
  readonly renderer: TRenderer;
  readonly featureServices: Record<string, unknown>;
}

export interface FeatureRefContext {
  readonly documentRoot?: Document;
  readonly ui: Readonly<Record<string, UiRef<Element> | readonly Element[]>>;
  readonly inputs: Readonly<
    Record<
      string,
      UiRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    >
  >;
  readonly featureServices: Record<string, unknown>;
}

export interface FeatureDefinition<
  TState = unknown,
  TTransport = unknown,
  TResultView = unknown,
  TController = unknown,
  TRenderer = unknown,
  TLifecycle extends FeatureLifecycle<TState> = FeatureLifecycle<TState>,
> {
  readonly id: FeatureId;
  readonly order: number;
  readonly title: string;
  readonly createState: () => TState;
  readonly createTransport?: (context: FeatureFactoryContext<TState>) => TTransport;
  readonly createResultView?: (context: FeatureFactoryContext<TState, TTransport>) => TResultView;
  readonly createController?: (context: FeatureFactoryContext<TState, TTransport, TResultView>) => TController;
  readonly createRenderer?: (context: FeatureFactoryContext<TState, TTransport, TResultView, TController>) => TRenderer;
  readonly createFeature?: (
    context: FeatureFactoryContext<TState, TTransport, TResultView, TController, TRenderer>,
  ) => TLifecycle;
  readonly createRefs?: (context: FeatureRefContext) => UiRefMap;
  readonly queryDom?: (root: Document) => UiRefMap;
  readonly templateFragments: TemplateFragments;
  readonly dependencies: readonly CapabilityId[];
  readonly provides: readonly CapabilityId[];
  readonly settingsDependencies: readonly SettingId[];
  readonly pickingTargets: readonly PickingTargetDefinition[];
  readonly renderLayers: readonly string[];
  readonly sharedControlPolicy: Readonly<Record<string, unknown>>;
  readonly inputReader?: string;
  readonly ui: FeatureUiContract;
  activate?(context: FeatureLifecycleContext<TState> & {readonly instance: FeatureInstance}): void;
  deactivate?(context: FeatureLifecycleContext<TState> & {readonly instance: FeatureInstance}): void;
  dispose?(context: FeatureLifecycleContext<TState> & {readonly instance: FeatureInstance}): void;
}

export type FeatureInstance<
  TState = unknown,
  TTransport = unknown,
  TResultView = unknown,
  TController = unknown,
  TRenderer = unknown,
  TLifecycle extends FeatureLifecycle<TState> = FeatureLifecycle<TState>,
> = Readonly<{
  dom: UiRefMap;
  transport: TTransport;
  resultView: TResultView;
  controller: TController;
  renderer: TRenderer;
}> & TResultView & TController & TRenderer & TLifecycle;
