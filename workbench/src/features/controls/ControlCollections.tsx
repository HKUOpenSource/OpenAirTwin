import type { MouseEvent } from "react";

import { useUiCommand } from "../../app/use-ui-command.ts";
import { classNames } from "../../design-system/class-names.ts";
import {
  controlActionCommand,
  type MobilityWaypointViewModel,
  type RadarTargetControlViewModel,
} from "./contracts.ts";

export function MobilityWaypointList({
  items,
}: {
  readonly items: readonly MobilityWaypointViewModel[];
}) {
  const dispatch = useUiCommand();
  return (
    <div id="mobilityWaypointList" className="waypointList">
      {items.length === 0 ? (
        <div className="waypointEmpty oat-empty-state">No Rx waypoints yet</div>
      ) : (
        items.map((item) => (
          <div
            key={item.index}
            className={classNames(
              "waypointItem oat-list-card oat-list-card--interactive",
              item.selected && "active",
            )}
            onClick={() => {
              void dispatch(
                controlActionCommand("mobilityWaypoint.select", item.index),
              );
            }}
          >
            <span className="waypointIndex">{item.index + 1}</span>
            <span className="waypointCoord">[{item.coordinate}]</span>
            <button
              className="waypointRemove"
              type="button"
              aria-label={`Remove waypoint ${String(item.index + 1)}`}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                void dispatch(
                  controlActionCommand("mobilityWaypoint.remove", item.index),
                );
              }}
            >
              {"\u00d7"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export function RadarTargetList({
  targets,
}: {
  readonly targets: readonly RadarTargetControlViewModel[];
}) {
  const dispatch = useUiCommand();
  return (
    <div
      id="radarTargetList"
      className="radarTargetList oat-scroll-region"
      role="listbox"
      aria-label="Radar targets"
    >
      {targets.length === 0 ? (
        <p className="radarEmptyState oat-empty-state">
          No targets added. Choose a drone model above, then select Add Target.
        </p>
      ) : (
        targets.map((target) => (
          <button
            key={target.id}
            type="button"
            className={classNames(
              "radarTargetCard oat-list-card oat-list-card--interactive",
              target.selected && "selected",
            )}
            data-target-id={target.id}
            role="option"
            aria-selected={target.selected}
            onClick={() => {
              void dispatch(
                controlActionCommand("radarTarget.select", target.id),
              );
            }}
          >
            <strong>{target.name}</strong>
            <span>{target.meta}</span>
          </button>
        ))
      )}
    </div>
  );
}
