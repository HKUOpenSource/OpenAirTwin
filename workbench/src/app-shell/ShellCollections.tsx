import { classNames } from "../design-system/class-names.ts";
import type { UiExternalStore } from "../runtime/observable-state.ts";
import { useFeatureSnapshot } from "../runtime/observable-state.ts";
import type { ShellUiSnapshot } from "./shell-ui-model.ts";

export function EntryPlaceResults({
  store,
}: {
  readonly store: UiExternalStore<ShellUiSnapshot>;
}) {
  const { entryPlaces } = useFeatureSnapshot(store);
  return entryPlaces.map((place) => (
    <button
      className={classNames(
        "entryPlaceResult oat-list-card oat-list-card--interactive",
        place.active && "active",
      )}
      data-entry-place-index={place.index}
      key={place.index}
      type="button"
    >
      <b>{place.title}</b>
      <span>{place.detail}</span>
      <div className="entryPlaceMeta">{place.meta}</div>
    </button>
  ));
}

export function TileSelectionList({
  store,
}: {
  readonly store: UiExternalStore<ShellUiSnapshot>;
}) {
  const { tiles } = useFeatureSnapshot(store);
  return tiles.map((tile) => (
    <label
      className={classNames(
        "tileItem oat-check oat-list-card",
        tile.selected && "selected",
        tile.loaded && "loaded",
        tile.pendingAdd && "pendingAdd",
        tile.pendingRemove && "pendingRemove",
      )}
      data-tile-id={tile.id}
      key={tile.id}
    >
      <input
        type="checkbox"
        value={tile.id}
        checked={tile.selected}
        disabled={tile.disabled}
        onChange={() => undefined}
      />
      <div className="tileMeta">
        <div className="tileRow">
          <b>{tile.title}</b>
          <span className={tile.statusClassName}>{tile.status}</span>
        </div>
        <span>{tile.detail}</span>
      </div>
    </label>
  ));
}

export function PerformanceCategoryList({
  store,
}: {
  readonly store: UiExternalStore<ShellUiSnapshot>;
}) {
  const { performanceCategories } = useFeatureSnapshot(store);
  return performanceCategories.map((category) => (
    <label
      className={classNames(
        "categoryItem oat-check oat-list-card",
        !category.visible && "hiddenCategory",
      )}
      data-category={category.name}
      key={category.name}
    >
      <input
        type="checkbox"
        checked={category.visible}
        onChange={() => undefined}
      />
      <span>
        <span className="categoryName">{category.name}</span>
        <span className="categoryStats" data-category-stats={category.name}>
          {category.stats}
        </span>
      </span>
    </label>
  ));
}
