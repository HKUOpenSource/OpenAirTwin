function assertFeatureId(id) {
  if (!/^[a-z][a-z0-9_-]*$/.test(String(id || ""))) {
    throw new Error(`Invalid feature id: ${id}`);
  }
}

export function defineFeature(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Feature definition must be an object");
  }
  assertFeatureId(definition.id);
  if (typeof definition.title !== "string" || !definition.title.trim()) {
    throw new Error(`Feature ${definition.id} must define a title`);
  }
  if (typeof definition.createState !== "function") {
    throw new Error(`Feature ${definition.id} must define createState()`);
  }
  return Object.freeze({
    order: 0,
    templateFragments: Object.freeze({}),
    sharedControlPolicy: Object.freeze({}),
    settingsDependencies: Object.freeze([]),
    pickingTargets: Object.freeze([]),
    renderLayers: Object.freeze([]),
    dependencies: Object.freeze([]),
    provides: Object.freeze([]),
    ...definition,
  });
}

export class FeatureStore {
  constructor(definitions = []) {
    this._states = new Map();
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition) {
    if (this._states.has(definition.id)) {
      throw new Error(`Feature state already registered: ${definition.id}`);
    }
    const state = definition.createState();
    if (!state || typeof state !== "object") {
      throw new Error(`Feature ${definition.id} createState() must return an object`);
    }
    this._states.set(definition.id, state);
    return state;
  }

  get(id) {
    const state = this._states.get(id);
    if (!state) {
      throw new Error(`Unknown feature state: ${id}`);
    }
    return state;
  }

  has(id) {
    return this._states.has(id);
  }

  entries() {
    return this._states.entries();
  }
}

export class SettingsBus {
  constructor() {
    this._listeners = new Map();
  }

  subscribe(setting, listener) {
    const listeners = this._listeners.get(setting) || new Set();
    listeners.add(listener);
    this._listeners.set(setting, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this._listeners.delete(setting);
      }
    };
  }

  publish(setting, detail = {}) {
    for (const listener of this._listeners.get(setting) || []) {
      listener(detail);
    }
    for (const listener of this._listeners.get("*") || []) {
      listener({setting, ...detail});
    }
  }
}

export class PickingRegistry {
  constructor() {
    this._targets = new Map();
  }

  register(featureId, target) {
    if (!target || typeof target.id !== "string") {
      throw new Error(`Feature ${featureId} registered an invalid picking target`);
    }
    if (this._targets.has(target.id)) {
      throw new Error(`Picking target already registered: ${target.id}`);
    }
    const registered = Object.freeze({featureId, ...target});
    this._targets.set(target.id, registered);
    return registered;
  }

  get(id) {
    return this._targets.get(id) || null;
  }

  belongsTo(featureId, targetId) {
    return this.get(targetId)?.featureId === featureId;
  }

  targetsFor(featureId) {
    return [...this._targets.values()].filter((target) => target.featureId === featureId);
  }
}

function insertTemplateFragment(anchor, html) {
  if (!(anchor instanceof Element) || typeof html !== "string" || !html.trim()) {
    return [];
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  const nodes = [...template.content.childNodes];
  if (anchor instanceof HTMLTemplateElement) {
    anchor.parentNode.insertBefore(template.content, anchor);
  } else {
    anchor.appendChild(template.content);
  }
  return nodes.filter((node) => node.nodeType === Node.ELEMENT_NODE);
}

export class FeatureRegistry {
  constructor({definitions = [], store, settings = new SettingsBus(), picking = new PickingRegistry()} = {}) {
    this.store = store || new FeatureStore(definitions);
    this.settings = settings;
    this.picking = picking;
    this._definitions = new Map();
    this._instances = new Map();
    this._transports = new Map();
    this._settingsUnsubscribers = [];
    this._activeId = null;
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition) {
    if (this._definitions.has(definition.id)) {
      throw new Error(`Feature already registered: ${definition.id}`);
    }
    this._definitions.set(definition.id, definition);
    if (!this.store.has(definition.id)) {
      this.store.register(definition);
    }
    for (const target of definition.pickingTargets || []) {
      this.picking.register(definition.id, target);
    }
    return definition;
  }

  definitions() {
    return [...this._definitions.values()].sort((a, b) => a.order - b.order);
  }

  get(id) {
    return this._definitions.get(id) || null;
  }

  active() {
    return this._activeId ? this.get(this._activeId) : null;
  }

  ownsPickingTarget(featureId, targetId) {
    return this.picking.belongsTo(featureId, targetId);
  }

  mountTemplates(root = document) {
    for (const definition of this.definitions()) {
      for (const [anchorId, html] of Object.entries(definition.templateFragments || {})) {
        insertTemplateFragment(root.getElementById(anchorId), html);
      }
    }
  }

  initialize(context) {
    for (const unsubscribe of this._settingsUnsubscribers.splice(0)) {
      unsubscribe();
    }
    this._instances.clear();
    this._transports.clear();
    const providedCapabilities = new Set();
    for (const definition of this.definitions()) {
      const missingCapabilities = (definition.dependencies || []).filter(
        (capability) => !providedCapabilities.has(capability),
      );
      if (missingCapabilities.length) {
        throw new Error(
          `Feature ${definition.id} requires unavailable capabilities: ${missingCapabilities.join(", ")}`,
        );
      }
      const dom = definition.createRefs?.(context)
        || definition.queryDom?.(context.documentRoot || globalThis.document)
        || {};
      const featureContext = {...context, definition, featureState: this.store.get(definition.id), dom};
      const transport = definition.createTransport?.(featureContext) || {};
      this._transports.set(definition.id, transport);
      const resultView = definition.createResultView?.({...featureContext, transport}) || {};
      const controller = definition.createController?.({...featureContext, transport, resultView}) || {};
      const renderer = definition.createRenderer?.({...featureContext, transport, resultView, controller}) || {};
      const lifecycle = definition.createFeature?.({
        ...featureContext,
        transport,
        resultView,
        controller,
        renderer,
      }) || {};
      const instance = {
        dom,
        transport,
        resultView,
        controller,
        renderer,
        ...resultView,
        ...controller,
        ...renderer,
        ...lifecycle,
      };
      this._instances.set(definition.id, instance);
      for (const capability of definition.provides || []) {
        providedCapabilities.add(capability);
      }
      for (const setting of definition.settingsDependencies || []) {
        this._settingsUnsubscribers.push(this.settings.subscribe(setting, (detail) => {
          instance?.onSettingsChanged?.(setting, detail);
        }));
      }
    }
  }

  attachEvents(context = {}) {
    for (const definition of this.definitions()) {
      this.instance(definition.id)?.attachEvents?.({...context, definition});
    }
  }

  render(context = {}) {
    for (const definition of this.definitions()) {
      this.instance(definition.id)?.render?.({...context, definition});
    }
  }

  instance(id) {
    return this._instances.get(id) || null;
  }

  transport(id) {
    return this._transports.get(id) || null;
  }

  uiRef(featureId, ref, sharedUi = {}) {
    if (!ref) {
      return null;
    }
    return sharedUi[ref] ?? this.instance(featureId)?.dom?.[ref] ?? null;
  }

  activate(id, context = {}) {
    const next = this.get(id);
    if (!next) {
      throw new Error(`Unknown feature: ${id}`);
    }
    if (this._activeId === id) {
      return next;
    }
    const previousId = this._activeId;
    const previous = previousId ? this.get(previousId) : null;
    const previousInstance = previousId ? this.instance(previousId) : null;
    previousInstance?.deactivate?.({...context, definition: previous});
    previous?.deactivate?.({...context, instance: previousInstance});
    this._activeId = id;
    if (context.state) {
      context.state.mode = id;
    }
    const nextInstance = this.instance(id);
    next?.activate?.({...context, instance: nextInstance});
    nextInstance?.activate?.({...context, definition: next});
    return next;
  }

  dispose(context = {}) {
    for (const definition of this.definitions().reverse()) {
      const instance = this.instance(definition.id);
      instance?.dispose?.({...context, definition});
      definition.dispose?.({...context, instance});
    }
    this._instances.clear();
    this._transports.clear();
    for (const unsubscribe of this._settingsUnsubscribers.splice(0)) {
      unsubscribe();
    }
    this._activeId = null;
  }
}
