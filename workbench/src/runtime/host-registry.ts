export type ImperativeHostKey =
  | "view"
  | "entryMapScene"
  | "entryMapFigure"
  | "entryMapViewport"
  | "linkTapChart"
  | "mobilityTimelineCanvas"
  | "radarAssetPreviewCanvas"
  | "radarRdCanvas"
  | "radarRangeCanvas";

export interface ImperativeHostRegistry {
  readonly register: (key: ImperativeHostKey, element: Element | null) => void;
  readonly get: (key: ImperativeHostKey) => Element | null;
  readonly require: (key: ImperativeHostKey) => Element;
  readonly clear: () => void;
}

export function createImperativeHostRegistry(): ImperativeHostRegistry {
  const hosts = new Map<ImperativeHostKey, Element>();
  return {
    register(key, element) {
      if (element) {
        hosts.set(key, element);
      } else {
        hosts.delete(key);
      }
    },
    get(key) {
      return hosts.get(key) ?? null;
    },
    require(key) {
      const value = hosts.get(key);
      if (!value) {
        throw new Error(`Imperative host is not mounted: ${key}`);
      }
      return value;
    },
    clear() {
      hosts.clear();
    },
  };
}
