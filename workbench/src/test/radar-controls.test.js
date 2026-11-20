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
    const target = {
      id: "target-1",
      asset_id: "dji-mini-3",
      position: [96, 44, 30],
      orientation: [0, 0, 0],
      velocity: [0, 0, 0],
      rcs_m2: 0.025,
    };
    const controls = createRadarControls({
      state: {
        radar: {
          mode: "bistatic",
          assets: [],
          targets: [target],
          selectedTargetId: target.id,
          waveform: {
            carrierFrequencyGhz: 5.8,
            bandwidthMhz: 128,
            numSubcarriers: 1024,
            numSymbols: 1024,
          },
          signal: {
            txPowerDbm: 30,
            noiseFigureDb: 7,
            systemLossDb: 3,
            noiseTemperatureK: 290,
            directPathCancellation: true,
          },
          cfar: {
            enabled: true,
            guardRange: 1,
            guardDoppler: 1,
            trainingRange: 2,
            trainingDoppler: 4,
            falseAlarmProbability: 1e-8,
          },
          solver: {
            samplesPerSrc: 65536,
            maxNumPathsPerSrc: 4096,
            maxDepth: 2,
            seed: 42,
            los: true,
            specularReflection: true,
            diffuseReflection: true,
            refraction: true,
            diffraction: false,
            syntheticArray: false,
          },
        },
      },
    });

    controls.updateSelectedTargetField("rollDeg", 12);
    controls.updateSelectedTargetField("pitchDeg", -7);
    controls.updateSelectedTargetField("speed", speed);
    controls.updateSelectedTargetField("directionDeg", direction);
    controls.updateSelectedTargetField("climbDeg", climb);

    expect(target.orientation[0]).toBeCloseTo((12 * Math.PI) / 180, 6);
    expect(target.orientation[1]).toBeCloseTo((-7 * Math.PI) / 180, 6);
    expect(target.orientation[2]).toBeCloseTo((yaw * Math.PI) / 180, 6);
    target.velocity.forEach((value, index) =>
      expect(value).toBeCloseTo(velocity[index], 5),
    );
    const vm = controls.buildControlsViewModel();
    expect(vm.selectedTarget.directionDeg).toBe(yaw);
    expect(vm.selectedTarget.orientationDeg[2]).toBe(yaw);
  },
);
