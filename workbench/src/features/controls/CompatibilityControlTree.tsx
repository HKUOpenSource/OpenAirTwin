import {
  Children,
  createElement,
  Fragment,
  memo,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import { ControlledField } from "../../design-system/components/ControlledField.tsx";
import type { UiExternalStore } from "../../runtime/observable-state.ts";
import { useFeatureSnapshot } from "../../runtime/observable-state.ts";
import {
  controlActionCommand,
  controlGroupToggleCommand,
  type ControlNodeViewModel,
  type WorkbenchControlsSnapshot,
} from "./contracts.ts";
import {
  MobilityWaypointList,
  RadarTargetList,
} from "./ControlCollections.tsx";

interface TemplateElement {
  readonly tagName: string;
  readonly attributes: readonly [string, string][];
  readonly childNodes: readonly TemplateNode[];
  readonly innerHtml: string;
  readonly id?: string;
}

type TemplateNode =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "element"; readonly element: TemplateElement };

function serializeNode(node: Node): TemplateNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return { type: "text", value: node.textContent ?? "" };
  }
  if (!(node instanceof Element)) return null;
  const children =
    node instanceof HTMLTemplateElement
      ? [...node.content.childNodes]
      : [...node.childNodes];
  return {
    type: "element",
    element: {
      tagName: node.tagName.toLowerCase(),
      attributes: [...node.attributes].map(({ name, value }) => [name, value]),
      childNodes: children.flatMap((child) => {
        const serialized = serializeNode(child);
        return serialized ? [serialized] : [];
      }),
      innerHtml: node.innerHTML,
      ...(node.id ? { id: node.id } : {}),
    },
  };
}

function parseTemplate(source: string): readonly TemplateNode[] {
  const template = document.createElement("template");
  template.innerHTML = source;
  return [...template.content.childNodes].flatMap((node) => {
    const serialized = serializeNode(node);
    return serialized ? [serialized] : [];
  });
}

function reactPropertyName(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  if (name === "tabindex") return "tabIndex";
  if (name === "readonly") return "readOnly";
  if (name === "viewbox") return "viewBox";
  return name;
}

const voidElementNames = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Phase 6 keeps leaf nodes stable so approved legacy text/Canvas adapters can
// mutate their host without React replacing it during unrelated field updates.
const ImperativeElement = memo(
  function ImperativeElement({
    element,
    node,
  }: {
    readonly element: TemplateElement;
    readonly node: ControlNodeViewModel | undefined;
  }) {
    const properties = elementProperties(element, node);
    properties.dangerouslySetInnerHTML = { __html: element.innerHtml };
    return createElement(element.tagName, properties);
  },
  () => true,
);

function elementProperties(
  element: TemplateElement,
  node: ControlNodeViewModel | undefined,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, value] of element.attributes) {
    if (["checked", "disabled", "open", "selected", "value"].includes(name))
      continue;
    properties[reactPropertyName(name)] = value === "" ? true : value;
  }
  if (node) {
    properties.className = node.className;
    for (const [name, value] of Object.entries(node.attributes)) {
      properties[reactPropertyName(name)] = value;
    }
    if (node.disabled !== undefined) properties.disabled = node.disabled;
  }
  return properties;
}

function ActionElement({
  element,
  node,
  children,
  ownsText,
}: {
  readonly element: TemplateElement;
  readonly node: ControlNodeViewModel | undefined;
  readonly children: ReactNode;
  readonly ownsText: boolean;
}) {
  const dispatch = useUiCommand();
  const properties = elementProperties(element, node);
  properties.onClick = () => {
    if (element.id) void dispatch(controlActionCommand(element.id));
  };
  if (ownsText) {
    properties.dangerouslySetInnerHTML = { __html: element.innerHtml };
    return createElement("button", properties);
  }
  return createElement("button", properties, children);
}

function DetailsElement({
  element,
  node,
  children,
}: {
  readonly element: TemplateElement;
  readonly node: ControlNodeViewModel | undefined;
  readonly children: ReactNode;
}) {
  const dispatch = useUiCommand();
  const properties = elementProperties(element, node);
  const startsOpen = element.attributes.some(([name]) => name === "open");
  const [localOpen, setLocalOpen] = useState(startsOpen);
  properties.open = element.id ? Boolean(node?.open) : localOpen;
  properties.onToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (element.id) {
      void dispatch(
        controlGroupToggleCommand(element.id, event.currentTarget.open),
      );
    } else {
      setLocalOpen(event.currentTarget.open);
    }
  };
  return createElement("details", properties, children);
}

function renderTemplateNode(
  templateNode: TemplateNode,
  snapshot: WorkbenchControlsSnapshot,
  key: string,
): ReactNode {
  if (templateNode.type === "text") return templateNode.value;
  const { element } = templateNode;
  const node = element.id ? snapshot.nodes[element.id] : undefined;
  const field = element.id ? snapshot.fields[element.id] : undefined;
  if (field && ["input", "select"].includes(element.tagName)) {
    const attributes = Object.fromEntries(element.attributes);
    return (
      <ControlledField
        key={key}
        id={element.id ?? ""}
        field={field}
        {...(node?.className || attributes.class
          ? { className: node?.className || attributes.class }
          : {})}
        {...(attributes.name ? { name: attributes.name } : {})}
        {...(attributes["aria-label"]
          ? { ariaLabel: attributes["aria-label"] }
          : {})}
        ariaReadOnly={attributes["aria-readonly"] === "true"}
        {...(attributes.tabindex
          ? { tabIndex: Number(attributes.tabindex) }
          : {})}
      />
    );
  }
  if (element.id === "mobilityWaypointList") {
    return (
      <MobilityWaypointList key={key} items={snapshot.mobilityWaypoints} />
    );
  }
  if (element.id === "radarTargetList") {
    return <RadarTargetList key={key} targets={snapshot.radarTargets} />;
  }
  if (element.id === "radarTargetCount") {
    return (
      <span
        key={key}
        id="radarTargetCount"
        className="radarSummaryBadge oat-badge"
      >
        {snapshot.radarTargetCount}
      </span>
    );
  }

  const childElements = element.childNodes.some(
    (child) => child.type === "element",
  );
  const children =
    node?.text !== undefined && !childElements
      ? node.text
      : element.childNodes.map((child, index) =>
          renderTemplateNode(child, snapshot, `${key}.${String(index)}`),
        );
  if (element.tagName === "button") {
    return (
      <ActionElement
        key={key}
        element={element}
        node={node}
        ownsText={!childElements}
      >
        {children}
      </ActionElement>
    );
  }
  if (element.tagName === "details") {
    return (
      <DetailsElement key={key} element={element} node={node}>
        {children}
      </DetailsElement>
    );
  }
  const properties = elementProperties(element, node);
  if (element.tagName === "progress" && node?.progressValue !== undefined) {
    properties.value = node.progressValue;
  }
  if (voidElementNames.has(element.tagName)) {
    return createElement(element.tagName, { ...properties, key });
  }
  if (!childElements) {
    return <ImperativeElement key={key} element={element} node={node} />;
  }
  return createElement(
    element.tagName,
    { ...properties, key },
    Children.toArray(children),
  );
}

export function CompatibilityControlTree({
  source,
  store,
}: {
  readonly source: string;
  readonly store: UiExternalStore<WorkbenchControlsSnapshot>;
}) {
  const snapshot = useFeatureSnapshot(store);
  const template = useMemo(() => parseTemplate(source), [source]);
  return (
    <Fragment>
      {template.map((node, index) =>
        renderTemplateNode(node, snapshot, `control.${String(index)}`),
      )}
    </Fragment>
  );
}
