import { expect, test } from "vitest";
import { createRadarControls } from "/js/features/radar/controls.js";

test.each([
  { direction: 0, speed: 12, climb: 0, yaw: 0, velocity: [12, 0, 0] },
  { direction: 90, speed: 12, climb: 0, yaw: 90, velocity: [0, 12, 0] },
  {
    direction: -142,
    speed: 12,
    climb: 0,
    yaw: -142,
    velocity: [-9.456129, -7.387938, 0],
  },
  {
    direction: 218,
    speed: 12,
    climb: 0,
    yaw: -142,
    velocity: [-9.456129, -7.387938, 0],
  },
  { direction: 270, speed: 0, climb: 0, yaw: -90, velocity: [0, 0, 0] },
  { direction: 360, speed: 12, climb: 0, yaw: 0, velocity: [12, 0, 0] },
  { direction: 90, speed: 12, climb: 30, yaw: 90, velocity: [0, 10.392305, 6] },
])(
  "target motion: direction $direction, speed $speed, climb $climb",
  ({ direction, speed, climb, yaw, velocity }) => {
    const target = { id: "target-1" };
    const values = {
      radarTargetAsset: "dji-mini-3",
      radarTargetX: 96,
      radarTargetY: 44,
      radarTargetZ: 30,
      radarTargetRoll: 12,
      radarTargetPitch: -7,
      radarTargetYaw: 0,
      radarTargetSpeed: speed,
      radarTargetDirection: direction,
      radarTargetClimb: climb,
      radarTargetRcs: 0.025,
    };
    const dom = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        { value: String(value) },
      ]),
    );
    dom.radarVelocityVectorPreview = { textContent: "" };
    const controls = createRadarControls({
      dom,
      state: { radar: { targets: [target], selectedTargetId: target.id } },
    });

    controls.readTargetEditor();

    expect(target.orientation[0]).toBeCloseTo((12 * Math.PI) / 180, 6);
    expect(target.orientation[1]).toBeCloseTo((-7 * Math.PI) / 180, 6);
    expect(target.orientation[2]).toBeCloseTo((yaw * Math.PI) / 180, 6);
    target.velocity.forEach((value, index) =>
      expect(value).toBeCloseTo(velocity[index], 5),
    );
    expect(dom.radarTargetDirection.value).toBe(yaw.toFixed(1));
    expect(dom.radarTargetYaw.value).toBe(yaw.toFixed(1));
  },
);
