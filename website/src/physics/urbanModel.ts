export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly zM: number;
}

export interface BuildingRect {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly heightM: number;
}

export interface RayPath {
  readonly kind: "los" | "reflection" | "diffraction";
  readonly points: readonly Point2D[];
  readonly points3D: readonly Point3D[];
  readonly distanceM: number;
  readonly delayNs: number;
  readonly powerDbm: number;
  readonly order: number;
}

export interface LinkSimulationResult {
  readonly paths: readonly RayPath[];
  readonly losVisible: boolean;
  readonly rxPowerDbm: number;
  readonly delaySpreadNs: number;
  readonly distanceM: number;
}

export interface MobilitySample {
  readonly progress: number;
  readonly rx: Point2D;
  readonly paths: readonly RayPath[];
  readonly losVisible: boolean;
  readonly rxPowerDbm: number;
}

export interface RadioMapGridResult {
  readonly cols: number;
  readonly rows: number;
  readonly valuesDbm: Float32Array;
  readonly buildingMask: Uint8Array;
  readonly minDbm: number;
  readonly maxDbm: number;
  readonly meanDbm: number;
  readonly coveragePct: number;
  readonly losPct: number;
}

export interface DeepMimoGridResult {
  readonly roiX: number;
  readonly roiY: number;
  readonly roiWidthUnits: number;
  readonly roiHeightUnits: number;
  readonly cols: number;
  readonly rows: number;
  readonly points: readonly Point2D[];
  readonly powersDbm: Float32Array;
  readonly minDbm: number;
  readonly maxDbm: number;
  readonly outdoorCount: number;
  readonly maskedCount: number;
  readonly estimatedSizeMb: number;
}

export interface RadarTargetState {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly model: string;
  readonly pos: Point2D;
  readonly altitudeM: number;
  readonly headingDeg: number;
  readonly radialVelocityMs: number;
  readonly rangeM: number;
  readonly rcsDbsm: number;
  readonly txLos: boolean;
  readonly rxLos: boolean;
  readonly occluded: boolean;
  readonly orbitPath: readonly Point3D[];
}

export interface RadarDetection {
  readonly targetId: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly rangeM: number;
  readonly velocityMs: number;
  readonly snrDb: number;
}

export interface RadarSectorSpec {
  readonly radiusUnits: number;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
}

export interface RadarSimulationResult {
  readonly tx: Point2D;
  readonly rx: Point2D;
  readonly txHeightM: number;
  readonly rxHeightM: number;
  readonly sector: RadarSectorSpec;
  readonly targets: readonly RadarTargetState[];
  readonly detections: readonly RadarDetection[];
  readonly rdCols: number;
  readonly rdRows: number;
  readonly rdMatrixDb: Float32Array;
  readonly clutterSuppressedDb: number;
  readonly maxRangeM: number;
  readonly maxVelocityMs: number;
}

/** 160 x 100 units at 4 m/unit => 640 m x 400 m urban district (16:10 aspect). */
export const WORLD_W = 160;
export const WORLD_H = 100;
export const UNITS_TO_METERS = 4;
const SPEED_OF_LIGHT_MPS = 299_792_458;
const TX_POWER_DBM = 23;

export const DEFAULT_TX_HEIGHT_M = 26;
export const DEFAULT_RX_HEIGHT_M = 2;

export const DEFAULT_TX: Point2D = { x: 28, y: 36 };
export const DEFAULT_RX: Point2D = { x: 126, y: 35 };

export const URBAN_BUILDINGS: readonly BuildingRect[] = [
  { id: "B1", label: "NW Block", x: 10, y: 10, w: 24, h: 18, heightM: 28 },
  { id: "B2", label: "North Tower", x: 44, y: 8, w: 24, h: 20, heightM: 46 },
  { id: "B3", label: "Civic Hall", x: 78, y: 10, w: 22, h: 17, heightM: 24 },
  { id: "B4", label: "NE Spire", x: 112, y: 9, w: 20, h: 19, heightM: 38 },
  { id: "B5", label: "East Terrace", x: 138, y: 14, w: 14, h: 22, heightM: 18 },
  { id: "B6", label: "West Courtyard", x: 10, y: 46, w: 20, h: 16, heightM: 22 },
  { id: "B7", label: "Central Core", x: 56, y: 42, w: 26, h: 16, heightM: 40 },
  { id: "B8", label: "Midtown Block", x: 98, y: 42, w: 22, h: 17, heightM: 32 },
  { id: "B9", label: "SW Annex", x: 14, y: 70, w: 24, h: 20, heightM: 30 },
  { id: "B10", label: "South Plaza", x: 52, y: 69, w: 32, h: 19, heightM: 16 },
  { id: "B11", label: "SE Complex", x: 100, y: 68, w: 34, h: 21, heightM: 36 },
];

export const MOBILITY_WAYPOINTS: readonly Point2D[] = [
  { x: 18, y: 35 },
  { x: 46, y: 35 },
  { x: 46, y: 63 },
  { x: 90, y: 63 },
  { x: 90, y: 35 },
  { x: 128, y: 35 },
];

export function clampPoint(point: Point2D): Point2D {
  return {
    x: Math.max(5, Math.min(WORLD_W - 5, point.x)),
    y: Math.max(5, Math.min(WORLD_H - 5, point.y)),
  };
}

export function isPointInsideBuilding(point: Point2D, margin = 1.0): boolean {
  return URBAN_BUILDINGS.some(
    (b) =>
      point.x >= b.x - margin &&
      point.x <= b.x + b.w + margin &&
      point.y >= b.y - margin &&
      point.y <= b.y + b.h + margin,
  );
}

export function nudgePointOutsideBuildings(point: Point2D): Point2D {
  const clamped = clampPoint(point);
  if (!isPointInsideBuilding(clamped, 1.0)) return clamped;

  let best = clamped;
  let bestDist = Infinity;
  for (const b of URBAN_BUILDINGS) {
    if (
      clamped.x >= b.x - 1.0 &&
      clamped.x <= b.x + b.w + 1.0 &&
      clamped.y >= b.y - 1.0 &&
      clamped.y <= b.y + b.h + 1.0
    ) {
      const candidates: Point2D[] = [
        clampPoint({ x: b.x - 1.8, y: clamped.y }),
        clampPoint({ x: b.x + b.w + 1.8, y: clamped.y }),
        clampPoint({ x: clamped.x, y: b.y - 1.8 }),
        clampPoint({ x: clamped.x, y: b.y + b.h + 1.8 }),
      ];
      for (const candidate of candidates) {
        if (isPointInsideBuilding(candidate, 0.8)) continue;
        const d = Math.hypot(candidate.x - clamped.x, candidate.y - clamped.y);
        if (d < bestDist) {
          bestDist = d;
          best = candidate;
        }
      }
    }
  }
  return best;
}

function segmentsIntersectParam(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): { point: Point2D; t: number } | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-7) return null;
  const t = ((c.x - a.x) * sY - (c.y - a.y) * sX) / denom;
  const u = ((c.x - a.x) * rY - (c.y - a.y) * rX) / denom;
  if (t > 1e-4 && t < 1 - 1e-4 && u >= 0 && u <= 1) {
    return { point: { x: a.x + t * rX, y: a.y + t * rY }, t };
  }
  return null;
}

function segmentIntersectsRect(
  a: Point2D,
  b: Point2D,
  rect: BuildingRect,
  inset = 0.05,
): boolean {
  const x0 = rect.x + inset;
  const y0 = rect.y + inset;
  const x1 = rect.x + rect.w - inset;
  const y1 = rect.y + rect.h - inset;
  const corners: readonly Point2D[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  for (let i = 0; i < 4; i += 1) {
    if (segmentsIntersectParam(a, b, corners[i], corners[(i + 1) % 4])) {
      return true;
    }
  }
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return midX > x0 && midX < x1 && midY > y0 && midY < y1;
}

function segmentIntersectsRect3D(
  a: Point3D,
  b: Point3D,
  rect: BuildingRect,
  inset = 0.05,
  heightPadM = 0,
): boolean {
  const minX = rect.x + inset;
  const maxX = rect.x + rect.w - inset;
  const minY = rect.y + inset;
  const maxY = rect.y + rect.h - inset;
  const minZ = 0;
  const maxZ = rect.heightM + heightPadM;

  let tMin = 0;
  let tMax = 1;

  const slabs: Array<[number, number, number, number]> = [
    [a.x, b.x - a.x, minX, maxX],
    [a.y, b.y - a.y, minY, maxY],
    [a.zM, b.zM - a.zM, minZ, maxZ],
  ];

  for (const [origin, dir, lo, hi] of slabs) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }

  return tMax > 1e-4 && tMin < 1 - 1e-4;
}

export function isLineOfSightClear(
  a: Point2D,
  b: Point2D,
  skipBuildingId?: string,
): boolean {
  for (const building of URBAN_BUILDINGS) {
    if (building.id === skipBuildingId) continue;
    if (segmentIntersectsRect(a, b, building)) return false;
  }
  return true;
}

export function isLineOfSightClear3D(
  a: Point3D,
  b: Point3D,
  skipBuildingId?: string,
  inset = 0.05,
  heightPadM = 0,
): boolean {
  for (const building of URBAN_BUILDINGS) {
    if (building.id === skipBuildingId) continue;
    if (segmentIntersectsRect3D(a, b, building, inset, heightPadM)) return false;
  }
  return true;
}

function pathLossDb(distanceM: number, freqGhz: number): number {
  const safeDistance = Math.max(distanceM, 2);
  return 32.45 + 20 * Math.log10(freqGhz) + 20 * Math.log10(safeDistance);
}

function polylineDistance3DM(points: readonly Point3D[]): number {
  let sumM = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dxM = (points[i].x - points[i - 1].x) * UNITS_TO_METERS;
    const dyM = (points[i].y - points[i - 1].y) * UNITS_TO_METERS;
    const dzM = points[i].zM - points[i - 1].zM;
    sumM += Math.hypot(dxM, dyM, dzM);
  }
  return sumM;
}

function computeSingleReflections(
  tx: Point3D,
  rx: Point3D,
  freqGhz: number,
): RayPath[] {
  const reflections: RayPath[] = [];

  for (const b of URBAN_BUILDINGS) {
    const walls: Array<{
      axis: "x" | "y";
      coord: number;
      minSpan: number;
      maxSpan: number;
      normalDir: number;
    }> = [
      { axis: "y", coord: b.y, minSpan: b.x, maxSpan: b.x + b.w, normalDir: -1 },
      { axis: "y", coord: b.y + b.h, minSpan: b.x, maxSpan: b.x + b.w, normalDir: 1 },
      { axis: "x", coord: b.x, minSpan: b.y, maxSpan: b.y + b.h, normalDir: -1 },
      { axis: "x", coord: b.x + b.w, minSpan: b.y, maxSpan: b.y + b.h, normalDir: 1 },
    ];

    for (const wall of walls) {
      if (wall.axis === "y") {
        const sideTx = tx.y - wall.coord;
        const sideRx = rx.y - wall.coord;
        if (sideTx * wall.normalDir <= 0.4 || sideRx * wall.normalDir <= 0.4) {
          continue;
        }
        const mirroredTxY = 2 * wall.coord - tx.y;
        const t = (wall.coord - mirroredTxY) / (rx.y - mirroredTxY);
        if (t <= 0 || t >= 1) continue;
        const hitX = tx.x + t * (rx.x - tx.x);
        if (hitX < wall.minSpan + 0.5 || hitX > wall.maxSpan - 0.5) continue;
        const rawZ = tx.zM + t * (rx.zM - tx.zM);
        if (rawZ > b.heightM - 1) continue;
        const bounceZ = Math.max(2.2, Math.min(b.heightM - 1.5, rawZ));
        const bounce3D: Point3D = {
          x: hitX,
          y: wall.coord + wall.normalDir * 0.25,
          zM: bounceZ,
        };
        if (
          isLineOfSightClear3D(tx, bounce3D, b.id) &&
          isLineOfSightClear3D(bounce3D, rx, b.id)
        ) {
          const pts3D = [tx, bounce3D, rx];
          const distanceM = polylineDistance3DM(pts3D);
          const delayNs = (distanceM / SPEED_OF_LIGHT_MPS) * 1e9;
          const powerDbm = TX_POWER_DBM - pathLossDb(distanceM, freqGhz) - 5.5;
          reflections.push({
            kind: "reflection",
            points: pts3D.map((p) => ({ x: p.x, y: p.y })),
            points3D: pts3D,
            distanceM,
            delayNs,
            powerDbm,
            order: 1,
          });
        }
      } else {
        const sideTx = tx.x - wall.coord;
        const sideRx = rx.x - wall.coord;
        if (sideTx * wall.normalDir <= 0.4 || sideRx * wall.normalDir <= 0.4) {
          continue;
        }
        const mirroredTxX = 2 * wall.coord - tx.x;
        const t = (wall.coord - mirroredTxX) / (rx.x - mirroredTxX);
        if (t <= 0 || t >= 1) continue;
        const hitY = tx.y + t * (rx.y - tx.y);
        if (hitY < wall.minSpan + 0.5 || hitY > wall.maxSpan - 0.5) continue;
        const rawZ = tx.zM + t * (rx.zM - tx.zM);
        if (rawZ > b.heightM - 1) continue;
        const bounceZ = Math.max(2.2, Math.min(b.heightM - 1.5, rawZ));
        const bounce3D: Point3D = {
          x: wall.coord + wall.normalDir * 0.25,
          y: hitY,
          zM: bounceZ,
        };
        if (
          isLineOfSightClear3D(tx, bounce3D, b.id) &&
          isLineOfSightClear3D(bounce3D, rx, b.id)
        ) {
          const pts3D = [tx, bounce3D, rx];
          const distanceM = polylineDistance3DM(pts3D);
          const delayNs = (distanceM / SPEED_OF_LIGHT_MPS) * 1e9;
          const powerDbm = TX_POWER_DBM - pathLossDb(distanceM, freqGhz) - 5.5;
          reflections.push({
            kind: "reflection",
            points: pts3D.map((p) => ({ x: p.x, y: p.y })),
            points3D: pts3D,
            distanceM,
            delayNs,
            powerDbm,
            order: 1,
          });
        }
      }
    }
  }

  return reflections;
}

function computeDiffractionPaths(
  tx: Point3D,
  rx: Point3D,
  freqGhz: number,
  losVisible: boolean,
): RayPath[] {
  const candidates: RayPath[] = [];
  const directDistM = polylineDistance3DM([tx, rx]);
  for (const b of URBAN_BUILDINGS) {
    const cornerZ = Math.min(
      b.heightM * 0.72,
      Math.max(4, (tx.zM + rx.zM) * 0.55),
    );
    const corners: Point3D[] = [
      { x: b.x - 0.6, y: b.y - 0.6, zM: cornerZ },
      { x: b.x + b.w + 0.6, y: b.y - 0.6, zM: cornerZ },
      { x: b.x + b.w + 0.6, y: b.y + b.h + 0.6, zM: cornerZ },
      { x: b.x - 0.6, y: b.y + b.h + 0.6, zM: cornerZ },
    ];
    for (const corner of corners) {
      if (isLineOfSightClear3D(tx, corner) && isLineOfSightClear3D(corner, rx)) {
        const pts3D = [tx, corner, rx];
        const distanceM = polylineDistance3DM(pts3D);
        if (distanceM > directDistM * 1.48) continue;
        const delayNs = (distanceM / SPEED_OF_LIGHT_MPS) * 1e9;
        const penalty = losVisible ? 15.5 : 12.5;
        const powerDbm = TX_POWER_DBM - pathLossDb(distanceM, freqGhz) - penalty;
        candidates.push({
          kind: "diffraction",
          points: pts3D.map((p) => ({ x: p.x, y: p.y })),
          points3D: pts3D,
          distanceM,
          delayNs,
          powerDbm,
          order: 1,
        });
      }
    }
  }
  candidates.sort((a, b) => b.powerDbm - a.powerDbm);
  return candidates.slice(0, 2);
}

export function computeLinkPaths(
  rawTx: Point2D,
  rawRx: Point2D,
  freqGhz = 3.5,
  maxDepth = 2,
  txHeightM = DEFAULT_TX_HEIGHT_M,
  rxHeightM = DEFAULT_RX_HEIGHT_M,
): LinkSimulationResult {
  const tx2 = nudgePointOutsideBuildings(rawTx);
  const rx2 = nudgePointOutsideBuildings(rawRx);
  const tx3: Point3D = { x: tx2.x, y: tx2.y, zM: txHeightM };
  const rx3: Point3D = { x: rx2.x, y: rx2.y, zM: rxHeightM };
  const directDistanceM = Math.max(2, polylineDistance3DM([tx3, rx3]));
  const losVisible = isLineOfSightClear3D(tx3, rx3);

  const paths: RayPath[] = [];
  if (losVisible) {
    paths.push({
      kind: "los",
      points: [tx2, rx2],
      points3D: [tx3, rx3],
      distanceM: directDistanceM,
      delayNs: (directDistanceM / SPEED_OF_LIGHT_MPS) * 1e9,
      powerDbm: TX_POWER_DBM - pathLossDb(directDistanceM, freqGhz),
      order: 0,
    });
  }

  if (maxDepth >= 1) {
    paths.push(...computeSingleReflections(tx3, rx3, freqGhz));
  }

  if (maxDepth >= 2) {
    paths.push(...computeDiffractionPaths(tx3, rx3, freqGhz, losVisible));
  }

  if (paths.length === 0) {
    // Rooftop over-the-building diffraction fallback when deeply occluded
    let ridgeZ = Math.max(txHeightM, rxHeightM) + 8;
    for (const b of URBAN_BUILDINGS) {
      if (segmentIntersectsRect(tx2, rx2, b)) {
        ridgeZ = Math.max(ridgeZ, b.heightM + 2.5);
      }
    }
    const mid3D: Point3D = {
      x: (tx3.x + rx3.x) / 2,
      y: (tx3.y + rx3.y) / 2,
      zM: ridgeZ,
    };
    const pts3D = [tx3, mid3D, rx3];
    const distanceM = polylineDistance3DM(pts3D);
    paths.push({
      kind: "diffraction",
      points: pts3D.map((p) => ({ x: p.x, y: p.y })),
      points3D: pts3D,
      distanceM,
      delayNs: (distanceM / SPEED_OF_LIGHT_MPS) * 1e9,
      powerDbm: TX_POWER_DBM - pathLossDb(distanceM, freqGhz) - 22,
      order: 2,
    });
  }

  paths.sort((a, b) => a.delayNs - b.delayNs);

  const linearWeights = paths.map((p) => Math.pow(10, p.powerDbm / 10));
  const totalLinear = linearWeights.reduce((acc, v) => acc + v, 0);
  const rxPowerDbm = totalLinear > 0 ? 10 * Math.log10(totalLinear) : -125;

  const meanDelay =
    totalLinear > 0
      ? paths.reduce((acc, p, idx) => acc + p.delayNs * linearWeights[idx], 0) /
        totalLinear
      : 0;
  const secondMoment =
    totalLinear > 0
      ? paths.reduce(
          (acc, p, idx) =>
            acc + (p.delayNs - meanDelay) ** 2 * linearWeights[idx],
          0,
        ) / totalLinear
      : 0;

  return {
    paths: paths.slice(0, 8),
    losVisible,
    rxPowerDbm,
    delaySpreadNs: Math.sqrt(Math.max(0, secondMoment)),
    distanceM: directDistanceM,
  };
}

export function pointAlongPolyline(
  waypoints: readonly Point2D[],
  t: number,
): Point2D {
  const clampedT = Math.max(0, Math.min(1, t));
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const len = Math.hypot(
      waypoints[i].x - waypoints[i - 1].x,
      waypoints[i].y - waypoints[i - 1].y,
    );
    segLengths.push(len);
    totalLen += len;
  }
  let target = clampedT * totalLen;
  for (let i = 0; i < segLengths.length; i += 1) {
    const len = segLengths[i];
    if (target <= len || i === segLengths.length - 1) {
      const localT = len > 1e-6 ? target / len : 0;
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
      };
    }
    target -= len;
  }
  return waypoints[waypoints.length - 1];
}

export function sampleMobilityTrajectory(
  tx: Point2D,
  freqGhz = 3.5,
  samples = 56,
  txHeightM = DEFAULT_TX_HEIGHT_M,
): readonly MobilitySample[] {
  const result: MobilitySample[] = [];
  for (let i = 0; i < samples; i += 1) {
    const progress = samples > 1 ? i / (samples - 1) : 0;
    const rx = pointAlongPolyline(MOBILITY_WAYPOINTS, progress);
    const link = computeLinkPaths(tx, rx, freqGhz, 2, txHeightM, DEFAULT_RX_HEIGHT_M);
    result.push({
      progress,
      rx,
      paths: link.paths,
      losVisible: link.losVisible,
      rxPowerDbm: link.rxPowerDbm,
    });
  }
  return result;
}

export function computeRadioMapGrid(
  rawTx: Point2D,
  freqGhz = 3.5,
  cols = 80,
  rows = 50,
  txHeightM = DEFAULT_TX_HEIGHT_M,
): RadioMapGridResult {
  const tx2 = nudgePointOutsideBuildings(rawTx);
  const tx3: Point3D = { x: tx2.x, y: tx2.y, zM: txHeightM };
  const valuesDbm = new Float32Array(cols * rows);
  const buildingMask = new Uint8Array(cols * rows);

  let sumDbm = 0;
  let outdoorCount = 0;
  let coveredCount = 0;
  let losCount = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = ((row + 0.5) / rows) * WORLD_H;
    for (let col = 0; col < cols; col += 1) {
      const x = ((col + 0.5) / cols) * WORLD_W;
      const idx = row * cols + col;
      if (isPointInsideBuilding({ x, y }, 0)) {
        buildingMask[idx] = 1;
        valuesDbm[idx] = -130;
        continue;
      }

      const rx3: Point3D = { x, y, zM: 1.5 };
      const distM = Math.max(
        4,
        polylineDistance3DM([tx3, rx3]),
      );
      const los = isLineOfSightClear3D(tx3, rx3);
      let shadowLoss = 0;
      if (!los) {
        let intersections = 0;
        for (const b of URBAN_BUILDINGS) {
          if (segmentIntersectsRect3D(tx3, rx3, b, 0.05)) {
            intersections += 1;
          }
        }
        shadowLoss = 13.5 + Math.max(0, intersections - 1) * 9.5;
      }
      const rxDbm = Math.max(
        -122,
        Math.min(-42, TX_POWER_DBM - pathLossDb(distM, freqGhz) - shadowLoss),
      );
      valuesDbm[idx] = rxDbm;
      sumDbm += rxDbm;
      outdoorCount += 1;
      if (rxDbm >= -95) coveredCount += 1;
      if (los) losCount += 1;
    }
  }

  return {
    cols,
    rows,
    valuesDbm,
    buildingMask,
    minDbm: -120,
    maxDbm: -48,
    meanDbm: outdoorCount > 0 ? sumDbm / outdoorCount : -120,
    coveragePct: outdoorCount > 0 ? (coveredCount / outdoorCount) * 100 : 0,
    losPct: outdoorCount > 0 ? (losCount / outdoorCount) * 100 : 0,
  };
}

export function computeDeepMimoGrid(
  roiWidthM: number,
  rxSpacingM: number,
  rawTx: Point2D = DEFAULT_TX,
  freqGhz = 3.5,
  txHeightM = DEFAULT_TX_HEIGHT_M,
): DeepMimoGridResult {
  const safeWidthM = Math.max(180, Math.min(540, roiWidthM));
  const safeHeightM = safeWidthM * 0.6;
  const safeSpacingM = Math.max(10, Math.min(36, rxSpacingM));
  const roiWidthUnits = safeWidthM / UNITS_TO_METERS;
  const roiHeightUnits = safeHeightM / UNITS_TO_METERS;
  const roiX = (WORLD_W - roiWidthUnits) / 2;
  const roiY = (WORLD_H - roiHeightUnits) / 2;

  const cols = Math.max(4, Math.floor(safeWidthM / safeSpacingM));
  const rows = Math.max(3, Math.floor(safeHeightM / safeSpacingM));

  const tx2 = nudgePointOutsideBuildings(rawTx);
  const tx3: Point3D = { x: tx2.x, y: tx2.y, zM: txHeightM };

  const points: Point2D[] = [];
  const powerList: number[] = [];
  let maskedCount = 0;

  for (let r = 0; r < rows; r += 1) {
    const y = roiY + ((r + 0.5) / rows) * roiHeightUnits;
    for (let c = 0; c < cols; c += 1) {
      const x = roiX + ((c + 0.5) / cols) * roiWidthUnits;
      if (isPointInsideBuilding({ x, y }, 0.4)) {
        maskedCount += 1;
      } else {
        points.push({ x, y });
        const rx3: Point3D = { x, y, zM: DEFAULT_RX_HEIGHT_M };
        const distM = Math.max(4, polylineDistance3DM([tx3, rx3]));
        const los = isLineOfSightClear3D(tx3, rx3);
        const shadowLoss = los ? 0 : 15;
        const dbm = Math.max(
          -120,
          Math.min(-45, TX_POWER_DBM - pathLossDb(distM, freqGhz) - shadowLoss),
        );
        powerList.push(dbm);
      }
    }
  }

  const powersDbm = Float32Array.from(powerList);
  const estimatedSizeMb = Math.max(0.4, points.length * 0.022);

  return {
    roiX,
    roiY,
    roiWidthUnits,
    roiHeightUnits,
    cols,
    rows,
    points,
    powersDbm,
    minDbm: -120,
    maxDbm: -48,
    outdoorCount: points.length,
    maskedCount,
    estimatedSizeMb,
  };
}

export function hasUavBuildingCollision(
  pos: Point2D,
  altitudeM: number,
  horizontalPad = 3.6,
  verticalPadM = 5.0,
): boolean {
  return URBAN_BUILDINGS.some(
    (b) =>
      pos.x >= b.x - horizontalPad &&
      pos.x <= b.x + b.w + horizontalPad &&
      pos.y >= b.y - horizontalPad &&
      pos.y <= b.y + b.h + horizontalPad &&
      altitudeM < b.heightM + verticalPadM,
  );
}

export function resolveSafeUavAltitude(
  pos: Point2D,
  altitudeM: number,
  horizontalPad = 3.6,
  verticalPadM = 5.0,
): number {
  let safeAltitude = altitudeM;
  for (const b of URBAN_BUILDINGS) {
    if (
      pos.x >= b.x - horizontalPad &&
      pos.x <= b.x + b.w + horizontalPad &&
      pos.y >= b.y - horizontalPad &&
      pos.y <= b.y + b.h + horizontalPad
    ) {
      safeAltitude = Math.max(safeAltitude, b.heightM + verticalPadM);
    }
  }
  return safeAltitude;
}

export function radarNormalizedCoords(
  rangeM: number,
  velocityMs: number,
  maxRangeM: number,
  maxVelocityMs: number,
): { readonly u: number; readonly v: number } {
  const u = Math.max(0, Math.min(1, velocityMs / (2 * maxVelocityMs) + 0.5));
  const v = Math.max(0, Math.min(1, 1 - rangeM / maxRangeM));
  return { u, v };
}

export function computeRadarScene(
  bistatic: boolean,
  velocityScale: number,
  cfarThresholdDb: number,
  phase: number,
  clutterSuppression = true,
): RadarSimulationResult {
  const tx: Point2D = { x: 18, y: 40 };
  const rx: Point2D = bistatic ? { x: 138, y: 61 } : { x: 18, y: 40 };
  const txHeightM = 40;
  const rxHeightM = bistatic ? 38 : 40;
  const sector: RadarSectorSpec = {
    radiusUnits: 112,
    startAngleRad: -0.34,
    endAngleRad: 0.54,
  };

  const baseTargets = [
    {
      id: "uav-1",
      label: "UAV-01 · Quad",
      shortLabel: "U1",
      model: "Quadcopter",
      cx: 95,
      cy: 21.5,
      rxRadius: 8.5,
      ryRadius: 3.0,
      altitudeM: 56,
      speedBase: 22.0,
      phaseOffset: 0.2,
      rcsDbsm: -9.5,
    },
    {
      id: "uav-2",
      label: "UAV-02 · Hex",
      shortLabel: "U2",
      model: "Hexacopter",
      cx: 115,
      cy: 37.5,
      rxRadius: 8.0,
      ryRadius: 3.0,
      altitudeM: 41,
      speedBase: 21.0,
      phaseOffset: 2.1,
      rcsDbsm: -6.2,
    },
    {
      id: "uav-3",
      label: "UAV-03 · Wing",
      shortLabel: "U3",
      model: "Fixed Wing",
      cx: 81.5,
      cy: 66.0,
      rxRadius: 11.5,
      ryRadius: 3.5,
      altitudeM: 25,
      speedBase: 15.0,
      phaseOffset: 1.5,
      rcsDbsm: -11.8,
    },
  ] as const;

  const sampleOrbitPoint = (
    spec: (typeof baseTargets)[number],
    theta: number,
  ): Point3D => {
    const x = Math.max(
      46,
      Math.min(WORLD_W - 10, spec.cx + Math.cos(theta) * spec.rxRadius),
    );
    const y = Math.max(
      10,
      Math.min(WORLD_H - 10, spec.cy + Math.sin(theta) * spec.ryRadius),
    );
    const zM = resolveSafeUavAltitude(
      { x, y },
      spec.altitudeM + Math.sin(theta * 2) * 1.5,
    );
    return { x, y, zM };
  };

  const maxRangeM = 520;
  const maxVelocityMs = 30;
  const rdCols = 120;
  const rdRows = 48;

  const tx3: Point3D = { x: tx.x, y: tx.y, zM: txHeightM };
  const rx3: Point3D = { x: rx.x, y: rx.y, zM: rxHeightM };

  const targets: RadarTargetState[] = baseTargets.map((spec) => {
    const theta = phase * Math.PI * 2 + spec.phaseOffset;
    const tgt3 = sampleOrbitPoint(spec, theta);
    const pos = { x: tgt3.x, y: tgt3.y };
    const altitudeM = tgt3.zM;
    const orbitPath: Point3D[] = [];
    for (let k = 0; k < 48; k += 1) {
      orbitPath.push(sampleOrbitPoint(spec, (k / 48) * Math.PI * 2));
    }
    const d1 = polylineDistance3DM([tx3, tgt3]);
    const d2 = polylineDistance3DM([rx3, tgt3]);
    const rangeM = 0.5 * (d1 + d2);
    const radialVelocityMs =
      spec.speedBase * velocityScale * Math.cos(theta - 0.4);
    const headingDeg = ((theta * 180) / Math.PI + 90) % 360;
    // Enforce conservative visual + physical 3D clearance so beams never clip building edges
    const txLos = isLineOfSightClear3D(tx3, tgt3, undefined, -0.35, 1.0);
    const rxLos = bistatic
      ? isLineOfSightClear3D(rx3, tgt3, undefined, -0.35, 1.0)
      : txLos;
    const occluded = !(txLos && rxLos);
    return {
      id: spec.id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      model: spec.model,
      pos,
      altitudeM,
      headingDeg,
      radialVelocityMs,
      rangeM,
      rcsDbsm: spec.rcsDbsm,
      txLos,
      rxLos,
      occluded,
      orbitPath,
    };
  });

  const rdMatrixDb = new Float32Array(rdCols * rdRows);
  const detections: RadarDetection[] = [];

  for (let rRow = 0; rRow < rdRows; rRow += 1) {
    const vCell = (rRow + 0.5) / rdRows;
    const rangeM = (1 - vCell) * maxRangeM;
    for (let dCol = 0; dCol < rdCols; dCol += 1) {
      const uCell = (dCol + 0.5) / rdCols;
      const velMs = (uCell - 0.5) * 2 * maxVelocityMs;
      const hash =
        Math.sin(rRow * 12.9898 + dCol * 78.233) * 43758.5453;
      const noise = (hash - Math.floor(hash)) * 3.2;
      const clutter = clutterSuppression
        ? 4 * Math.exp(-(velMs * velMs) / 1.8) * Math.exp(-rangeM / 280)
        : 28 * Math.exp(-(velMs * velMs) / 4.5) * Math.exp(-rangeM / 280);
      let signal = -96 + noise + clutter;

      for (const target of targets) {
        const dr = (rangeM - target.rangeM) / 22;
        const dv = (velMs - target.radialVelocityMs) / 1.5;
        const peakAmp =
          (target.occluded ? 6 : 42) + (target.rcsDbsm + 10) * 0.85;
        signal = Math.max(
          signal,
          -92 + peakAmp * Math.exp(-(dr * dr + dv * dv)) + noise * 0.3,
        );
      }
      rdMatrixDb[rRow * rdCols + dCol] = Math.max(-98, Math.min(-42, signal));
    }
  }

  for (const target of targets) {
    const snrDb =
      (target.occluded ? 4.5 : 21.8) +
      (target.rcsDbsm + 10) * 0.6 -
      (target.rangeM - 240) * 0.018;
    if (!target.occluded && snrDb >= cfarThresholdDb) {
      detections.push({
        targetId: target.id,
        label: target.label,
        shortLabel: target.shortLabel,
        rangeM: target.rangeM,
        velocityMs: target.radialVelocityMs,
        snrDb,
      });
    }
  }

  return {
    tx,
    rx,
    txHeightM,
    rxHeightM,
    sector,
    targets,
    detections,
    rdCols,
    rdRows,
    rdMatrixDb,
    clutterSuppressedDb: bistatic ? 28.4 : 24.8,
    maxRangeM,
    maxVelocityMs,
  };
}
