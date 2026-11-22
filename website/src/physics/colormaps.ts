export type ColormapName =
  | "viridis"
  | "plasma"
  | "turbo"
  | "inferno"
  | "magma"
  | "jet";

type RgbTuple = readonly [number, number, number];
type Stop = readonly [number, RgbTuple];

const COLORMAP_STOPS: Record<ColormapName, readonly Stop[]> = {
  viridis: [
    [0.0, [68, 1, 84]],
    [0.13, [72, 40, 120]],
    [0.25, [62, 74, 137]],
    [0.38, [49, 104, 142]],
    [0.5, [38, 130, 142]],
    [0.63, [31, 158, 137]],
    [0.75, [53, 183, 121]],
    [0.88, [109, 205, 89]],
    [1.0, [253, 231, 37]],
  ],
  plasma: [
    [0.0, [13, 8, 135]],
    [0.13, [75, 3, 161]],
    [0.25, [125, 3, 168]],
    [0.38, [168, 34, 150]],
    [0.5, [203, 70, 121]],
    [0.63, [229, 107, 93]],
    [0.75, [248, 148, 65]],
    [0.88, [253, 195, 40]],
    [1.0, [240, 249, 33]],
  ],
  turbo: [
    [0.0, [48, 18, 59]],
    [0.13, [50, 100, 178]],
    [0.25, [31, 150, 210]],
    [0.38, [39, 193, 146]],
    [0.5, [154, 215, 63]],
    [0.63, [245, 200, 47]],
    [0.75, [250, 132, 38]],
    [0.88, [220, 50, 32]],
    [1.0, [122, 4, 3]],
  ],
  inferno: [
    [0.0, [0, 0, 4]],
    [0.13, [31, 12, 72]],
    [0.25, [85, 15, 109]],
    [0.38, [136, 34, 106]],
    [0.5, [186, 54, 85]],
    [0.63, [227, 89, 51]],
    [0.75, [249, 140, 10]],
    [0.88, [249, 201, 50]],
    [1.0, [252, 255, 164]],
  ],
  magma: [
    [0.0, [0, 0, 4]],
    [0.13, [28, 16, 68]],
    [0.25, [79, 18, 123]],
    [0.38, [129, 37, 129]],
    [0.5, [181, 54, 122]],
    [0.63, [229, 80, 100]],
    [0.75, [251, 135, 97]],
    [0.88, [254, 194, 135]],
    [1.0, [252, 253, 191]],
  ],
  jet: [
    [0.0, [0, 0, 128]],
    [0.16, [0, 0, 255]],
    [0.36, [0, 160, 255]],
    [0.5, [0, 255, 255]],
    [0.68, [255, 255, 0]],
    [0.82, [255, 160, 0]],
    [0.93, [255, 0, 0]],
    [1.0, [128, 0, 0]],
  ],
};

export const COLORMAP_NAMES: readonly ColormapName[] = [
  "viridis",
  "plasma",
  "turbo",
  "inferno",
  "magma",
  "jet",
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value)));
}

export function colorForColormap(
  name: ColormapName,
  t: number,
): { r: number; g: number; b: number } {
  const stops = COLORMAP_STOPS[name] ?? COLORMAP_STOPS.viridis;
  const x = clamp01(t);
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [leftT, leftColor] = stops[index];
    const [rightT, rightColor] = stops[index + 1];
    if (x >= leftT && x <= rightT) {
      const u = (x - leftT) / Math.max(rightT - leftT, 1e-6);
      return {
        r: Math.round(leftColor[0] + (rightColor[0] - leftColor[0]) * u),
        g: Math.round(leftColor[1] + (rightColor[1] - leftColor[1]) * u),
        b: Math.round(leftColor[2] + (rightColor[2] - leftColor[2]) * u),
      };
    }
  }
  const fallback = stops[stops.length - 1][1];
  return { r: fallback[0], g: fallback[1], b: fallback[2] };
}

export function colorHexForColormap(name: ColormapName, t: number): string {
  const { r, g, b } = colorForColormap(name, t);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function colormapGradient(name: ColormapName, steps = 16): string {
  const count = Math.max(2, Math.floor(steps));
  const stops: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    stops.push(`${colorHexForColormap(name, t)} ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
