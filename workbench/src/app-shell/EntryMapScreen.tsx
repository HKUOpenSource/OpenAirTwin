import { useEffect, useRef } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Box,
  ChevronLeft,
  Crosshair,
  Home,
  Minus,
  Plus,
  Search,
} from "lucide-react";

import { useUiCommand } from "../app/use-ui-command.ts";
import type { ImperativeHostRegistry } from "../runtime/host-registry.ts";
import type { ShellSnapshot } from "../runtime/workbench-store.ts";

export function EntryMapScreen({
  shell,
  hosts,
}: {
  readonly shell: ShellSnapshot;
  readonly hosts: ImperativeHostRegistry;
}) {
  const dispatch = useUiCommand();
  const viewportRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hosts.register("entryMapViewport", viewportRef.current);
    hosts.register("entryMapFigure", figureRef.current);
    hosts.register("entryMapScene", sceneRef.current);
    return () => {
      hosts.register("entryMapViewport", null);
      hosts.register("entryMapFigure", null);
      hosts.register("entryMapScene", null);
    };
  }, [hosts]);

  const hidden = shell.screen !== "entry";
  const { entry } = shell;

  return (
    <section
      className="oat-entry-screen"
      id="entryScreen"
      data-testid="entry-screen"
      data-hidden={hidden}
      aria-hidden={hidden}
    >
      <div
        className="oat-entry-map-viewport"
        id="entryMapViewport"
        ref={viewportRef}
      >
        <div
          className="oat-entry-map-figure"
          id="entryMapFigure"
          ref={figureRef}
          onMouseLeave={() => {
            void dispatch({
              name: "entry.map.pointerLeave",
              payload: undefined,
            });
          }}
        >
          <div
            className="oat-entry-map-scene"
            id="entryMapScene"
            ref={sceneRef}
          />

          <div
            className="oat-entry-tooltip"
            data-hidden={!entry.tooltip.visible}
            style={{
              left: `${String(entry.tooltip.x)}px`,
              top: `${String(entry.tooltip.y)}px`,
            }}
          >
            <div>
              <strong>{entry.tooltip.title}</strong>
            </div>
            {entry.tooltip.body ? <div>{entry.tooltip.body}</div> : null}
          </div>
        </div>
      </div>

      {/* Collapsible Floating Place Search Card */}
      <aside
        className="oat-entry-sidebar oat-dense-surface"
        data-collapsed={entry.sidebarCollapsed}
        data-testid="entry-sidebar"
      >
        {entry.sidebarCollapsed ? (
          <IconButton
            label="Expand search sidebar"
            tooltip="Search places"
            size="sm"
            variant="ghost"
            icon={<Search size={16} />}
            onClick={() => {
              void dispatch({
                name: "entry.sidebar.toggle",
                payload: undefined,
              });
            }}
          />
        ) : (
          <>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <img
                className="oat-brand-logo"
                src="/assets/openairtwin_logo.png"
                alt="OpenAirTwin"
              />
              <IconButton
                label="Collapse search sidebar"
                tooltip="Collapse"
                size="sm"
                variant="ghost"
                icon={<ChevronLeft size={16} />}
                onClick={() => {
                  void dispatch({
                    name: "entry.sidebar.toggle",
                    payload: undefined,
                  });
                }}
              />
            </HStack>

            <HStack gap={1} vAlign="center">
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  label="Place Search"
                  isLabelHidden
                  startIcon={<Search size={14} />}
                  type="search"
                  size="sm"
                  width="100%"
                  placeholder="Search Hong Kong places..."
                  value={entry.searchQuery}
                  hasClear
                  onChange={(value) => {
                    void dispatch({
                      name: "entry.search.query",
                      payload: { query: value },
                    });
                  }}
                  onEnter={() => {
                    void dispatch({
                      name: "entry.search.submit",
                      payload: undefined,
                    });
                  }}
                />
              </div>
              <Button
                label="Search"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void dispatch({
                    name: "entry.search.submit",
                    payload: undefined,
                  });
                }}
              />
            </HStack>

            {entry.searchHint &&
            (entry.searchError || entry.searchResults.length === 0) ? (
              <Text
                type="supporting"
                color={entry.searchError ? "accent" : "secondary"}
              >
                {entry.searchHint}
              </Text>
            ) : null}

            {entry.searchResults.length > 0 ? (
              <div
                className="oat-entry-place-results"
                aria-live="polite"
                data-testid="entry-place-results"
              >
                {entry.searchResults.map((place) => (
                  <ClickableCard
                    key={`${String(place.index)}-${place.title}`}
                    label={`${place.title} ${place.detail}`}
                    padding={2}
                    variant={place.active ? "blue" : "default"}
                    onClick={() => {
                      void dispatch({
                        name: "entry.place.select",
                        payload: { index: place.index },
                      });
                    }}
                  >
                    <VStack gap={0.5}>
                      <Text type="label" weight="semibold">
                        {place.title}
                      </Text>
                      <Text type="supporting" color="secondary" maxLines={2}>
                        {place.detail}
                      </Text>
                    </VStack>
                  </ClickableCard>
                ))}
              </div>
            ) : null}
          </>
        )}
      </aside>

      {/* Top-Right Map Controls */}
      <div className="oat-entry-toolbar" role="toolbar" aria-label="Map tools">
        <IconButton
          label="Fit map"
          tooltip="Fit map"
          size="sm"
          variant="ghost"
          icon={<Home size={15} />}
          onClick={() => {
            void dispatch({ name: "entry.map.fit", payload: undefined });
          }}
        />
        <IconButton
          label="Focus selected tiles"
          tooltip="Focus selected tiles"
          size="sm"
          variant="ghost"
          icon={<Crosshair size={15} />}
          onClick={() => {
            void dispatch({
              name: "entry.map.focusSelection",
              payload: undefined,
            });
          }}
        />
        <Divider />
        <IconButton
          label="Zoom in"
          tooltip="Zoom in"
          size="sm"
          variant="ghost"
          icon={<Plus size={15} />}
          onClick={() => {
            void dispatch({ name: "entry.map.zoomIn", payload: undefined });
          }}
        />
        <IconButton
          label="Zoom out"
          tooltip="Zoom out"
          size="sm"
          variant="ghost"
          icon={<Minus size={15} />}
          onClick={() => {
            void dispatch({ name: "entry.map.zoomOut", payload: undefined });
          }}
        />
      </div>

      {/* Bottom Floating Selection & Load Bar */}
      <div className="oat-entry-footer" data-testid="entry-footer">
        <HStack gap={2} vAlign="center">
          <div style={{ flexShrink: 0 }}>
            <Badge label={entry.badgeValue} variant="info" />
          </div>
          {entry.badgeDetail ? (
            <Text type="supporting" color="secondary">
              {entry.badgeDetail}
            </Text>
          ) : null}
        </HStack>

        <span className="oat-bar-divider" aria-hidden="true" />

        <div className="oat-entry-legend" aria-label="Tile status legend">
          <span className="oat-legend-item">
            <i className="oat-legend-swatch oat-legend-swatch--available" />
            Available
          </span>
          <span className="oat-legend-item">
            <i className="oat-legend-swatch oat-legend-swatch--selected" />
            Selected
          </span>
          <span className="oat-legend-item">
            <i className="oat-legend-swatch oat-legend-swatch--loaded" />
            Loaded
          </span>
          <span className="oat-legend-item">
            <i className="oat-legend-swatch oat-legend-swatch--downloadable" />
            Downloadable
          </span>
        </div>

        <span className="oat-bar-divider" aria-hidden="true" />

        <HStack gap={1.5} vAlign="center">
          <Button
            label={entry.enterButtonLabel}
            size="sm"
            variant="primary"
            isDisabled={!entry.canEnterScene}
            onClick={() => {
              void dispatch({ name: "entry.scene.enter", payload: undefined });
            }}
          />
          {entry.canReturnScene ? (
            <IconButton
              label="Return to 3D"
              tooltip="Return to loaded 3D scene"
              size="sm"
              variant="secondary"
              icon={<Box size={15} />}
              onClick={() => {
                void dispatch({
                  name: "entry.scene.return",
                  payload: undefined,
                });
              }}
            />
          ) : null}
        </HStack>
      </div>
    </section>
  );
}
