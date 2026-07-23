import * as THREE from "/lib/three.module.js";
import {Line2} from "/lib/Line2.js";
import {LineGeometry} from "/lib/LineGeometry.js";
import {LineMaterial} from "/lib/LineMaterial.js";
import {colorForColormap} from "/js/colormaps.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function powerRange(items) {
  const values = items.map((item) => Number(item.value)).filter(Number.isFinite);
  return values.length ? {min: Math.min(...values), max: Math.max(...values)} : {min: 0, max: 1};
}

function pathColor(t) {
  const stops = [
    [0.0, [62, 76, 154]],
    [0.33, [69, 156, 206]],
    [0.5, [90, 188, 170]],
    [0.66, [146, 200, 116]],
    [0.82, [201, 178, 101]],
    [1.0, [196, 113, 113]],
  ];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [aT, aColor] = stops[index];
    const [bT, bColor] = stops[index + 1];
    if (t >= aT && t <= bT) {
      const u = (t - aT) / (bT - aT);
      const color = aColor.map((value, component) => Math.round(value + (bColor[component] - value) * u));
      return new THREE.Color(`rgb(${color[0]},${color[1]},${color[2]})`);
    }
  }
  return new THREE.Color("#c47171");
}

function lineObject(points, options = {}) {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((point) => [Number(point[0]), Number(point[1]), Number(point[2])]));
  const material = new LineMaterial({
    color: options.color instanceof THREE.Color ? options.color : new THREE.Color(options.color || "#1f6fff"),
    linewidth: Number(options.width || 2.4),
    transparent: options.opacity !== 1,
    opacity: options.opacity ?? 1,
    depthTest: options.depthTest !== false,
    depthWrite: options.depthWrite === true,
    toneMapped: false,
  });
  material.resolution.set(window.innerWidth, window.innerHeight);
  return new Line2(geometry, material);
}

export class PrimitiveRenderer {
  constructor() {
    this._renderers = new Map([
      ["polyline-set", (layer, primitive) => this.renderPolylineSet(layer, primitive)],
      ["trajectory", (layer, primitive) => this.renderTrajectory(layer, primitive)],
      ["marker-set", (layer, primitive) => this.renderMarkerSet(layer, primitive)],
      ["polygon-overlay", (layer, primitive) => this.renderPolygonOverlay(layer, primitive)],
      ["scalar-triangle-mesh", (layer, primitive) => this.renderScalarTriangleMesh(layer, primitive)],
      ["mesh-instance", (layer, primitive) => this.renderMeshInstance(layer, primitive)],
    ]);
  }

  register(type, renderer) {
    if (typeof type !== "string" || !type || typeof renderer !== "function") {
      throw new Error("Primitive renderer requires a type and renderer function");
    }
    if (this._renderers.has(type)) {
      throw new Error(`Primitive renderer already registered: ${type}`);
    }
    this._renderers.set(type, renderer);
  }

  render(layer, primitive) {
    const renderer = this._renderers.get(primitive?.type);
    if (!renderer) {
      throw new Error(`Unknown primitive type: ${primitive?.type}`);
    }
    return renderer(layer, primitive);
  }

  renderPolylineSet(layer, primitive) {
    layer.clear();
    const items = primitive.items || [];
    const range = powerRange(items);
    items.forEach((item, index) => {
      const selected = primitive.selectedIndex ?? -1;
      const emphasized = selected < 0 || index === selected;
      const value = Number(item.value);
      const t = range.max > range.min && Number.isFinite(value) ? (value - range.min) / (range.max - range.min) : 1;
      layer.add(lineObject(item.points || [], {
        color: item.color || pathColor(t),
        width: emphasized ? (item.width || primitive.selectedWidth || 3.2) : (primitive.dimmedWidth || 1.6),
        opacity: emphasized ? (item.opacity ?? primitive.selectedOpacity ?? 0.92) : (primitive.dimmedOpacity ?? 0.18),
        depthTest: primitive.depthTest !== false,
      }));
    });
    return layer.group;
  }

  renderTrajectory(layer, primitive) {
    layer.clear();
    const points = primitive.points || [];
    if (points.length < 1) {
      return null;
    }
    if (points.length >= 2) {
      layer.add(lineObject(points, {
        color: primitive.color || "#1f6fff",
        width: primitive.width || 2.6,
        opacity: primitive.opacity ?? 0.78,
      }));
    }
    this._addMarkers(layer, primitive.markers || points, primitive);
    return layer.group;
  }

  renderMarkerSet(layer, primitive) {
    layer.clear();
    this._addMarkers(layer, primitive.points || primitive.markers || [], primitive);
    return layer.group;
  }

  _addMarkers(layer, markers, primitive) {
    markers.forEach((point, index) => {
      const selected = index === primitive.selectedIndex;
      const material = new THREE.MeshBasicMaterial({
        color: selected ? (primitive.selectedColor || "#1eb980") : (primitive.markerColor || "#70a7ff"),
        transparent: true,
        opacity: selected ? 0.95 : 0.7,
        depthWrite: false,
      });
      const marker = new THREE.Mesh(new THREE.SphereGeometry(primitive.radius || 0.7, 12, 12), material);
      marker.position.set(Number(point[0]), Number(point[1]), Number(point[2]));
      marker.scale.setScalar(selected ? 1.35 : 1);
      layer.add(marker);
    });
  }

  renderPolygonOverlay(layer, primitive) {
    layer.clear();
    const points = primitive.points || [];
    if (points.length < 3) {
      return null;
    }
    const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(Number(point[0]), Number(point[1]))));
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: primitive.fillColor || "#35c2a1",
        transparent: true,
        opacity: primitive.fillOpacity ?? 0.18,
        side: THREE.DoubleSide,
        depthTest: primitive.depthTest === true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    fill.position.z = Number(primitive.z || 0);
    layer.add(fill);
    const lineZ = Number(primitive.z || 0) + Number(primitive.lineZOffset || 0);
    const closed = [...points.map((point) => [point[0], point[1], lineZ]), [points[0][0], points[0][1], lineZ]];
    layer.add(lineObject(closed, {
      color: primitive.lineColor || "#14a886",
      width: primitive.lineWidth || 2.4,
      opacity: primitive.lineOpacity ?? 0.96,
      depthTest: primitive.depthTest === true,
    }));
    layer.group.renderOrder = Number(primitive.renderOrder || 16);
    return layer.group;
  }

  renderScalarTriangleMesh(layer, primitive) {
    layer.clear();
    const values = primitive.values || [];
    const triangleCount = values.length;
    const colors = new Float32Array(triangleCount * 9);
    const min = Number(primitive.min);
    const max = Number(primitive.max);
    const range = Math.max(max - min, 1e-6);
    const invalidColor = primitive.invalidColor || {r: 112, g: 118, b: 128};
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const value = Number(values[triangle]);
      const color = values[triangle] !== null && Number.isFinite(value)
        ? colorForColormap(primitive.colormap || "jet", clamp01((value - min) / range))
        : invalidColor;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const base = triangle * 9 + vertex * 3;
        colors[base] = color.r > 1 ? color.r / 255 : color.r;
        colors[base + 1] = color.g > 1 ? color.g / 255 : color.g;
        colors[base + 2] = color.b > 1 ? color.b / 255 : color.b;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(primitive.positions || [], 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: primitive.opacity ?? 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = Number(primitive.renderOrder || 12);
    layer.add(mesh);
    return mesh;
  }

  renderMeshInstance(layer, primitive) {
    if (!primitive.object3D) {
      throw new Error("mesh-instance primitive requires object3D");
    }
    layer.add(primitive.object3D);
    return primitive.object3D;
  }
}
