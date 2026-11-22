import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw } from "lucide-react";

import type { LabModeSpec } from "../data/siteData";
import {
  colorForColormap,
  colormapGradient,
  type ColormapName,
} from "../physics/colormaps";
import {
  DEFAULT_RX_HEIGHT_M,
  DEFAULT_TX_HEIGHT_M,
  MOBILITY_WAYPOINTS,
  UNITS_TO_METERS,
  URBAN_BUILDINGS,
  WORLD_H,
  WORLD_W,
  nudgePointOutsideBuildings,
  type DeepMimoGridResult,
  type Point2D,
  type Point3D,
  type RadarSimulationResult,
  type RadioMapGridResult,
  type RayPath,
} from "../physics/urbanModel";

export type CameraPreset = "iso" | "top" | "side";

interface CameraPose {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
}

const CAMERA_PRESETS: Record<CameraPreset, CameraPose> = {
  iso: {
    position: [86, 112, 144],
    target: [2, 2, 2],
  },
  top: {
    position: [0, 188, 20],
    target: [0, 0, 0],
  },
  side: {
    position: [132, 36, 66],
    target: [0, 7, 0],
  },
};

const HEIGHT_VISUAL_SCALE = 1.45;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

function toSceneX(x: number): number {
  return x - WORLD_W / 2;
}

function toSceneZ(y: number): number {
  return y - WORLD_H / 2;
}

function toSceneY(zM: number): number {
  return (zM / UNITS_TO_METERS) * HEIGHT_VISUAL_SCALE;
}

function toWorldPoint(sceneX: number, sceneZ: number): Point2D {
  return nudgePointOutsideBuildings({
    x: sceneX + WORLD_W / 2,
    y: sceneZ + WORLD_H / 2,
  });
}

function toSceneVec3(pt: Point3D): THREE.Vector3 {
  return new THREE.Vector3(toSceneX(pt.x), toSceneY(pt.zM), toSceneZ(pt.y));
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    const anyChild = child as THREE.Mesh | THREE.LineSegments;
    if (anyChild.geometry) {
      anyChild.geometry.dispose();
    }
    const mat = (anyChild as THREE.Mesh).material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if ((m as THREE.MeshBasicMaterial).map) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
        }
        m.dispose();
      }
    } else if (mat) {
      if ((mat as THREE.MeshBasicMaterial).map) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
      }
      mat.dispose();
    }
  });
}

function addSegmentCylinder(
  group: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  colorHex: number,
  opacity = 0.94,
): void {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 0.05) return;

  const geom = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(start).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP_AXIS, dir.normalize());
  group.add(mesh);
}

function addTransceiverPin(
  group: THREE.Group,
  pos: Point2D,
  heightM: number,
  colorHex: number,
  scale = 1,
): void {
  const sx = toSceneX(pos.x);
  const sz = toSceneZ(pos.y);
  const sy = Math.max(0.8, toSceneY(heightM));

  // Ground footprint ring
  const ringGeom = new THREE.RingGeometry(1.4 * scale, 2.35 * scale, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.42,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(sx, 0.14, sz);
  group.add(ring);

  // Inner base dot
  const baseDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.95 * scale, 20),
    new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false }),
  );
  baseDot.rotation.x = -Math.PI / 2;
  baseDot.position.set(sx, 0.16, sz);
  group.add(baseDot);

  // Vertical mast
  const mastGeom = new THREE.CylinderGeometry(
    0.22 * scale,
    0.28 * scale,
    sy,
    10,
  );
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x3b424d,
    roughness: 0.55,
    metalness: 0.25,
  });
  const mast = new THREE.Mesh(mastGeom, mastMat);
  mast.position.set(sx, sy / 2, sz);
  group.add(mast);

  // Crisp white equator collar ring around vivid beacon sphere
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(1.72 * scale, 0.16 * scale, 10, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    }),
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.set(sx, sy, sz);
  group.add(collar);

  // Vivid beacon sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.52 * scale, 20, 16),
    new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false }),
  );
  sphere.position.set(sx, sy, sz);
  group.add(sphere);
}

function addRayPaths(group: THREE.Group, paths: readonly RayPath[]): void {
  const minDbm = -112;
  const maxDbm = -52;
  const tmpColor = new THREE.Color();

  for (const ray of paths) {
    const norm = (ray.powerDbm - minDbm) / (maxDbm - minDbm);
    const rgb = colorForColormap("plasma", norm);
    tmpColor.setRGB(
      rgb.r / 255,
      rgb.g / 255,
      rgb.b / 255,
      THREE.SRGBColorSpace,
    );
    const colorHex = tmpColor.getHex();
    const radius =
      ray.kind === "los" ? 0.5 : ray.kind === "reflection" ? 0.34 : 0.24;
    const opacity = ray.kind === "los" ? 0.98 : 0.88;

    for (let i = 1; i < ray.points3D.length; i += 1) {
      const a = toSceneVec3(ray.points3D[i - 1]);
      const b = toSceneVec3(ray.points3D[i]);
      addSegmentCylinder(group, a, b, radius, colorHex, opacity);

      if (i < ray.points3D.length - 1) {
        const nodeSphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.9, 12, 10),
          new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false }),
        );
        nodeSphere.position.copy(b);
        group.add(nodeSphere);
      }
    }
  }
}

function addUavMesh(
  group: THREE.Group,
  pos: Point2D,
  altitudeM: number,
  detected: boolean,
): void {
  const sx = toSceneX(pos.x);
  const sz = toSceneZ(pos.y);
  const sy = toSceneY(altitudeM);
  const accentHex = detected ? 0xc0262c : 0x6b7280;

  let baseElevM = 0;
  for (const b of URBAN_BUILDINGS) {
    if (
      pos.x >= b.x &&
      pos.x <= b.x + b.w &&
      pos.y >= b.y &&
      pos.y <= b.y + b.h
    ) {
      baseElevM = Math.max(baseElevM, b.heightM);
    }
  }
  const baseY = toSceneY(baseElevM) + 0.14;

  // Footprint shadow disc resting cleanly on street or rooftop surface
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 20),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.24,
      toneMapped: false,
    }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(sx, baseY, sz);
  group.add(shadowDisc);

  // Drop stem to show 3D altitude above street or rooftop
  if (sy > baseY + 0.2) {
    addSegmentCylinder(
      group,
      new THREE.Vector3(sx, baseY, sz),
      new THREE.Vector3(sx, sy, sz),
      0.11,
      accentHex,
      0.38,
    );
  }

  // Quadrotor body
  const uavGroup = new THREE.Group();
  uavGroup.position.set(sx, sy, sz);

  const hub = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.5,
      metalness: 0.3,
    }),
  );
  uavGroup.add(hub);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 16, 12),
    new THREE.MeshBasicMaterial({ color: accentHex, toneMapped: false }),
  );
  beacon.position.y = 0.55;
  uavGroup.add(beacon);

  const offsets: Array<[number, number]> = [
    [-2.0, -2.0],
    [2.0, -2.0],
    [-2.0, 2.0],
    [2.0, 2.0],
  ];
  for (const [ox, oz] of offsets) {
    addSegmentCylinder(
      uavGroup,
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(ox, 0.1, oz),
      0.16,
      0x374151,
      1,
    );
    const rotorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.95, 16),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
      }),
    );
    rotorRing.rotation.x = -Math.PI / 2;
    rotorRing.position.set(ox, 0.28, oz);
    uavGroup.add(rotorRing);
  }

  group.add(uavGroup);
}

export interface UrbanScene3DProps {
  readonly modeSpec: LabModeSpec;
  readonly tx: Point2D;
  readonly rx: Point2D;
  readonly rxHeightM: number;
  readonly txHeightM: number;
  readonly linkPaths: readonly RayPath[];
  readonly mobilityRx: Point2D;
  readonly mobilityPaths: readonly RayPath[];
  readonly radioMap: RadioMapGridResult;
  readonly colormap: ColormapName;
  readonly deepMimo: DeepMimoGridResult;
  readonly selectedDeepMimoIndex: number;
  readonly deepMimoTraceRays: boolean;
  readonly deepMimoUserPaths: readonly RayPath[];
  readonly radarSim: RadarSimulationResult;
  readonly radarBistatic: boolean;
  readonly resetSignal: number;
  readonly onPlaceRx: (pt: Point2D) => void;
  readonly onPlaceTx: (pt: Point2D) => void;
  readonly onSelectDeepMimoUser: (idx: number) => void;
}

export function UrbanScene3D({
  modeSpec,
  tx,
  rx,
  rxHeightM,
  txHeightM,
  linkPaths,
  mobilityRx,
  mobilityPaths,
  radioMap,
  colormap,
  deepMimo,
  selectedDeepMimoIndex,
  deepMimoTraceRays,
  deepMimoUserPaths,
  radarSim,
  radarBistatic,
  resetSignal,
  onPlaceRx,
  onPlaceTx,
  onSelectDeepMimoUser,
}: UrbanScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("iso");
  const [webglError, setWebglError] = useState<boolean>(false);

  // Refs to access latest callbacks inside pointer handlers without re-creating renderer
  const modeIdRef = useRef(modeSpec.id);
  modeIdRef.current = modeSpec.id;
  const onPlaceRxRef = useRef(onPlaceRx);
  onPlaceRxRef.current = onPlaceRx;
  const onPlaceTxRef = useRef(onPlaceTx);
  onPlaceTxRef.current = onPlaceTx;
  const onSelectDeepMimoRef = useRef(onSelectDeepMimoUser);
  onSelectDeepMimoRef.current = onSelectDeepMimoUser;

  // Imperative Three.js refs
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dynamicGroup: THREE.Group;
    groundPlane: THREE.Mesh;
    deepMimoMesh: THREE.InstancedMesh | null;
    requestRender: () => void;
    applyCameraPreset: (preset: CameraPreset) => void;
  } | null>(null);

  const applyCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    threeRef.current?.applyCameraPreset(preset);
  }, []);

  // Respond to external "Reset Scene" action (e.g. Workflows Card 01)
  useEffect(() => {
    if (resetSignal > 0) {
      applyCameraPreset("iso");
    }
  }, [resetSignal, applyCameraPreset]);

  // Initialize Three.js WebGL stage once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglError(true);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D urban propagation viewport",
    );
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f7f9);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    const isoPose = CAMERA_PRESETS.iso;
    camera.position.set(...isoPose.position);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.08;
    controls.minDistance = 55;
    controls.maxDistance = 300;
    controls.target.set(...isoPose.target);
    controls.update();

    // Studio Lighting (clean directional shadows + soft ambient hemisphere fill)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd8e0ea, 0.95);
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.05);
    sunLight.position.set(85, 135, 75);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 360;
    sunLight.shadow.camera.left = -105;
    sunLight.shadow.camera.right = 105;
    sunLight.shadow.camera.top = 105;
    sunLight.shadow.camera.bottom = -105;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xe6eef8, 0.38);
    rimLight.position.set(-90, 60, -80);
    scene.add(rimLight);

    // Architectural studio base plinth & ground plane
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(WORLD_W + 4, 1.6, WORLD_H + 4),
      new THREE.MeshStandardMaterial({
        color: 0xe3e7ee,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    plinth.position.set(0, -0.82, 0);
    plinth.receiveShadow = true;
    scene.add(plinth);

    const groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W + 4, WORLD_H + 4),
      new THREE.MeshStandardMaterial({
        color: 0xeef1f5,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = 0;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Subtle rectangular street drafting lines strictly bounded inside district
    const gridVertices: number[] = [];
    const halfW = WORLD_W / 2;
    const halfH = WORLD_H / 2;
    for (let x = -halfW; x <= halfW; x += 10) {
      gridVertices.push(x, 0.02, -halfH, x, 0.02, halfH);
    }
    for (let z = -halfH; z <= halfH; z += 10) {
      gridVertices.push(-halfW, 0.02, z, halfW, 0.02, z);
    }
    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridVertices, 3),
    );
    const gridLines = new THREE.LineSegments(
      gridGeom,
      new THREE.LineBasicMaterial({
        color: 0xd0d7e2,
        transparent: true,
        opacity: 0.55,
      }),
    );
    scene.add(gridLines);

    // Static extruded 3D Urban Buildings (DeepMIMO Visualizer matte slate + crisp edges)
    const buildingsGroup = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x646c78,
      roughness: 0.84,
      metalness: 0.05,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x262c35,
      transparent: true,
      opacity: 0.28,
    });

    for (const b of URBAN_BUILDINGS) {
      const hScene = toSceneY(b.heightM);
      const boxGeom = new THREE.BoxGeometry(b.w, hScene, b.h);
      const mesh = new THREE.Mesh(boxGeom, buildingMat);
      mesh.position.set(
        toSceneX(b.x + b.w / 2),
        hScene / 2,
        toSceneZ(b.y + b.h / 2),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      buildingsGroup.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeom),
        edgeMat,
      );
      edges.position.copy(mesh.position);
      buildingsGroup.add(edges);
    }
    scene.add(buildingsGroup);

    const dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    // On-demand render scheduler (no idle continuous RAF burning battery)
    let rafId = 0;
    let dampingFramesRemaining = 0;
    let cameraGoal: {
      startPos: THREE.Vector3;
      endPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      endTarget: THREE.Vector3;
      t: number;
    } | null = null;

    const renderFrame = () => {
      renderer.render(scene, camera);
    };

    const tick = () => {
      rafId = 0;
      let needsAnother = false;

      if (cameraGoal) {
        cameraGoal.t = Math.min(1, cameraGoal.t + 0.14);
        const ease = 1 - Math.pow(1 - cameraGoal.t, 3);
        camera.position.lerpVectors(
          cameraGoal.startPos,
          cameraGoal.endPos,
          ease,
        );
        controls.target.lerpVectors(
          cameraGoal.startTarget,
          cameraGoal.endTarget,
          ease,
        );
        controls.update();
        if (cameraGoal.t < 1) {
          needsAnother = true;
        } else {
          cameraGoal = null;
        }
      } else if (dampingFramesRemaining > 0) {
        controls.update();
        dampingFramesRemaining -= 1;
        if (dampingFramesRemaining > 0) {
          needsAnother = true;
        }
      }

      renderFrame();

      if (needsAnother && !rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const requestRender = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handleControlChange = () => {
      dampingFramesRemaining = 14;
      requestRender();
    };
    controls.addEventListener("change", handleControlChange);

    const setPreset = (preset: CameraPreset) => {
      const pose = CAMERA_PRESETS[preset];
      const nextPos = new THREE.Vector3(...pose.position);
      const nextTarget = new THREE.Vector3(...pose.target);

      if (prefersReducedMotion()) {
        cameraGoal = null;
        camera.position.copy(nextPos);
        controls.target.copy(nextTarget);
        controls.update();
        renderFrame();
        return;
      }

      cameraGoal = {
        startPos: camera.position.clone(),
        endPos: nextPos,
        startTarget: controls.target.clone(),
        endTarget: nextTarget,
        t: 0,
      };
      requestRender();
    };

    // Raycast click-to-pick (only fires when pointer drag distance < 5px)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (ev: globalThis.PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };

    const handlePointerUp = (ev: globalThis.PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) >= 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const currentMode = modeIdRef.current;
      const state = threeRef.current;
      if (currentMode === "deepmimo" && state?.deepMimoMesh) {
        const hits = raycaster.intersectObject(state.deepMimoMesh, false);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
          onSelectDeepMimoRef.current(hits[0].instanceId);
          return;
        }
      }

      if (currentMode === "link" || currentMode === "radiomap") {
        const hits = raycaster.intersectObject(groundPlane, false);
        if (hits.length > 0) {
          const worldPt = toWorldPoint(hits[0].point.x, hits[0].point.z);
          if (currentMode === "link") {
            onPlaceRxRef.current(worldPt);
          } else {
            onPlaceTxRef.current(worldPt);
          }
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    // ResizeObserver keeps WebGL crisp at any pane size
    const updateSize = (w: number, h: number) => {
      const safeW = Math.max(240, Math.round(w));
      const safeH = Math.max(200, Math.round(h));
      renderer.setSize(safeW, safeH, false);
      camera.aspect = safeW / safeH;
      camera.updateProjectionMatrix();
      requestRender();
    };
    updateSize(width, height);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(container);

    threeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      dynamicGroup,
      groundPlane,
      deepMimoMesh: null,
      requestRender,
      applyCameraPreset: setPreset,
    };

    return () => {
      resizeObserver.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
      controls.removeEventListener("change", handleControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      disposeObjectTree(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      threeRef.current = null;
    };
  }, []);

  // Synchronize active 3D mode layer objects whenever simulation state changes
  useEffect(() => {
    const state = threeRef.current;
    if (!state) return;

    const { dynamicGroup, requestRender } = state;
    disposeObjectTree(dynamicGroup);
    dynamicGroup.clear();
    state.deepMimoMesh = null;

    if (modeSpec.id === "link") {
      addTransceiverPin(dynamicGroup, tx, txHeightM, 0x0074e2, 1.05);
      addTransceiverPin(dynamicGroup, rx, rxHeightM, 0x0d9488, 1.0);
      addRayPaths(dynamicGroup, linkPaths);
    } else if (modeSpec.id === "mobility") {
      addTransceiverPin(dynamicGroup, tx, txHeightM, 0x0074e2, 1.05);

      const routeElevM = DEFAULT_RX_HEIGHT_M + 0.5;
      for (let i = 1; i < MOBILITY_WAYPOINTS.length; i += 1) {
        const a = toSceneVec3({
          x: MOBILITY_WAYPOINTS[i - 1].x,
          y: MOBILITY_WAYPOINTS[i - 1].y,
          zM: routeElevM,
        });
        const b = toSceneVec3({
          x: MOBILITY_WAYPOINTS[i].x,
          y: MOBILITY_WAYPOINTS[i].y,
          zM: routeElevM,
        });
        addSegmentCylinder(dynamicGroup, a, b, 0.42, 0x198100, 0.72);
      }
      for (const wp of MOBILITY_WAYPOINTS) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.7, 12, 10),
          new THREE.MeshBasicMaterial({ color: 0x198100 }),
        );
        marker.position.set(toSceneX(wp.x), toSceneY(routeElevM), toSceneZ(wp.y));
        dynamicGroup.add(marker);
      }

      addTransceiverPin(dynamicGroup, mobilityRx, DEFAULT_RX_HEIGHT_M, 0x0d9488, 1.0);
      addRayPaths(dynamicGroup, mobilityPaths);
    } else if (modeSpec.id === "radiomap") {
      addTransceiverPin(dynamicGroup, tx, txHeightM, 0x0074e2, 1.15);

      const { cols, rows, valuesDbm, buildingMask, minDbm, maxDbm } = radioMap;
      const texBytes = new Uint8Array(cols * rows * 4);
      const span = Math.max(1, maxDbm - minDbm);

      for (let row = 0; row < rows; row += 1) {
        const destRow = rows - 1 - row;
        for (let col = 0; col < cols; col += 1) {
          const srcIdx = row * cols + col;
          const dstIdx = (destRow * cols + col) * 4;
          if (buildingMask[srcIdx] === 1) {
            texBytes[dstIdx] = 220;
            texBytes[dstIdx + 1] = 224;
            texBytes[dstIdx + 2] = 230;
            texBytes[dstIdx + 3] = 0;
          } else {
            const norm = (valuesDbm[srcIdx] - minDbm) / span;
            const { r, g, b } = colorForColormap(colormap, norm);
            texBytes[dstIdx] = r;
            texBytes[dstIdx + 1] = g;
            texBytes[dstIdx + 2] = b;
            texBytes[dstIdx + 3] = 235;
          }
        }
      }

      const texture = new THREE.DataTexture(
        texBytes,
        cols,
        rows,
        THREE.RGBAFormat,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.flipY = false;
      texture.needsUpdate = true;

      const mapPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD_W, WORLD_H),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mapPlane.rotation.x = -Math.PI / 2;
      mapPlane.position.y = 0.08;
      dynamicGroup.add(mapPlane);
    } else if (modeSpec.id === "deepmimo") {
      addTransceiverPin(dynamicGroup, tx, txHeightM, 0x0074e2, 1.05);

      // 3D wireframe bounding box around outdoor ROI
      const roiBoxGeom = new THREE.BoxGeometry(
        deepMimo.roiWidthUnits,
        0.5,
        deepMimo.roiHeightUnits,
      );
      const roiWire = new THREE.LineSegments(
        new THREE.EdgesGeometry(roiBoxGeom),
        new THREE.LineBasicMaterial({
          color: 0x7c3aed,
          transparent: true,
          opacity: 0.72,
        }),
      );
      roiBoxGeom.dispose();
      roiWire.position.set(
        toSceneX(deepMimo.roiX + deepMimo.roiWidthUnits / 2),
        0.26,
        toSceneZ(deepMimo.roiY + deepMimo.roiHeightUnits / 2),
      );
      dynamicGroup.add(roiWire);

      // InstancedMesh outdoor sample points colored via viridis like DeepMIMO Visualizer
      const count = deepMimo.points.length;
      if (count > 0) {
        const markerSize = Math.max(1.3, Math.min(2.6, 44 / Math.sqrt(count)));
        const tileGeom = new THREE.BoxGeometry(markerSize, 0.36, markerSize);
        const tileMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          toneMapped: false,
        });
        const instanced = new THREE.InstancedMesh(tileGeom, tileMat, count);
        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        const span = Math.max(1, deepMimo.maxDbm - deepMimo.minDbm);

        for (let i = 0; i < count; i += 1) {
          const pt = deepMimo.points[i];
          dummy.position.set(toSceneX(pt.x), 0.22, toSceneZ(pt.y));
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);

          const norm = (deepMimo.powersDbm[i] - deepMimo.minDbm) / span;
          const rgb = colorForColormap("viridis", norm);
          color.setRGB(
            rgb.r / 255,
            rgb.g / 255,
            rgb.b / 255,
            THREE.SRGBColorSpace,
          );
          instanced.setColorAt(i, color);
        }
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
        dynamicGroup.add(instanced);
        state.deepMimoMesh = instanced;

        const safeIdx = Math.max(
          0,
          Math.min(count - 1, selectedDeepMimoIndex),
        );
        const selectedPt = deepMimo.points[safeIdx];
        addTransceiverPin(
          dynamicGroup,
          selectedPt,
          DEFAULT_RX_HEIGHT_M,
          0x7c3aed,
          0.95,
        );
        if (deepMimoTraceRays) {
          addRayPaths(dynamicGroup, deepMimoUserPaths);
        }
      }
    } else if (modeSpec.id === "radar") {
      addTransceiverPin(
        dynamicGroup,
        radarSim.tx,
        radarSim.txHeightM,
        0x0074e2,
        1.0,
      );
      if (radarBistatic) {
        addTransceiverPin(
          dynamicGroup,
          radarSim.rx,
          radarSim.rxHeightM,
          0x0d9488,
          1.0,
        );
      }

      // Radar illumination sector synchronized to radarSim.sector boundaries
      const { radiusUnits, startAngleRad, endAngleRad } = radarSim.sector;
      const sectorGeom = new THREE.CircleGeometry(
        radiusUnits,
        40,
        -endAngleRad,
        endAngleRad - startAngleRad,
      );
      const sectorMesh = new THREE.Mesh(
        sectorGeom,
        new THREE.MeshBasicMaterial({
          color: 0x0074e2,
          transparent: true,
          opacity: 0.085,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      sectorMesh.rotation.x = -Math.PI / 2;
      sectorMesh.position.set(
        toSceneX(radarSim.tx.x),
        0.1,
        toSceneZ(radarSim.tx.y),
      );
      dynamicGroup.add(sectorMesh);

      const txSceneX = toSceneX(radarSim.tx.x);
      const txSceneZ = toSceneZ(radarSim.tx.y);
      const outlinePts: THREE.Vector3[] = [
        new THREE.Vector3(txSceneX, 0.14, txSceneZ),
      ];
      const arcSteps = 32;
      for (let step = 0; step <= arcSteps; step += 1) {
        const ang =
          startAngleRad + (step / arcSteps) * (endAngleRad - startAngleRad);
        outlinePts.push(
          new THREE.Vector3(
            txSceneX + radiusUnits * Math.cos(ang),
            0.14,
            txSceneZ + radiusUnits * Math.sin(ang),
          ),
        );
      }
      const sectorOutline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(outlinePts),
        new THREE.LineBasicMaterial({
          color: 0x0074e2,
          transparent: true,
          opacity: 0.3,
          toneMapped: false,
        }),
      );
      dynamicGroup.add(sectorOutline);

      const txVec = toSceneVec3({
        x: radarSim.tx.x,
        y: radarSim.tx.y,
        zM: radarSim.txHeightM,
      });
      const rxVec = toSceneVec3({
        x: radarSim.rx.x,
        y: radarSim.rx.y,
        zM: radarSim.rxHeightM,
      });

      for (const target of radarSim.targets) {
        if (target.orbitPath.length >= 3) {
          const orbitPts = target.orbitPath.map((pt) => toSceneVec3(pt));
          const orbitLoop = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(orbitPts),
            new THREE.LineBasicMaterial({
              color: 0x64748b,
              transparent: true,
              opacity: 0.28,
              toneMapped: false,
            }),
          );
          dynamicGroup.add(orbitLoop);
        }

        const detected = radarSim.detections.some(
          (d) => d.targetId === target.id,
        );
        addUavMesh(dynamicGroup, target.pos, target.altitudeM, detected);

        const tgtVec = toSceneVec3({
          x: target.pos.x,
          y: target.pos.y,
          zM: target.altitudeM,
        });

        // Only render physically unobstructed line-of-sight radar beams
        if (target.txLos) {
          addSegmentCylinder(
            dynamicGroup,
            txVec,
            tgtVec,
            detected ? 0.28 : 0.18,
            detected ? 0xc0262c : 0x6b7280,
            detected ? 0.82 : 0.45,
          );
        }

        if (radarBistatic && target.txLos && target.rxLos) {
          addSegmentCylinder(
            dynamicGroup,
            tgtVec,
            rxVec,
            detected ? 0.24 : 0.16,
            detected ? 0x0d9488 : 0x6b7280,
            detected ? 0.78 : 0.42,
          );
        }
      }
    }

    requestRender();
  }, [
    modeSpec.id,
    tx,
    rx,
    rxHeightM,
    txHeightM,
    linkPaths,
    mobilityRx,
    mobilityPaths,
    radioMap,
    colormap,
    deepMimo,
    selectedDeepMimoIndex,
    deepMimoTraceRays,
    deepMimoUserPaths,
    radarSim,
    radarBistatic,
  ]);

  const legendSpec = useMemo(() => {
    const formatBound = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
    if (modeSpec.id === "radiomap") {
      return {
        title: "Path Gain (dBm)",
        minLabel: formatBound(radioMap.minDbm),
        maxLabel: formatBound(radioMap.maxDbm),
        gradient: colormapGradient(colormap),
      };
    }
    if (modeSpec.id === "deepmimo") {
      return {
        title: deepMimoTraceRays ? "User Power (dBm)" : "Grid Power (dBm)",
        minLabel: formatBound(deepMimo.minDbm),
        maxLabel: formatBound(deepMimo.maxDbm),
        gradient: colormapGradient("viridis"),
      };
    }
    if (modeSpec.id === "radar") {
      return null;
    }
    return {
      title: "Path Power (dBm)",
      minLabel: "−112",
      maxLabel: "−52",
      gradient: colormapGradient("plasma"),
    };
  }, [modeSpec.id, colormap, radioMap.minDbm, radioMap.maxDbm, deepMimo, deepMimoTraceRays]);

  return (
    <div className="oat-lab-viewport" ref={containerRef}>
      {webglError ? (
        <div className="oat-lab-webgl-fallback" role="status">
          <strong>WebGL 3D view is unavailable in this browser.</strong>
          <span>
            Controls and live metrics remain interactive in the panel.
          </span>
        </div>
      ) : null}

      {/* Top-Left Gesture Hint Pill (Astryx frosted HUD) */}
      <div className="oat-hud-top-left">
        <span className="oat-hud-hint">{modeSpec.stageHint}</span>
      </div>

      {/* Top-Right Camera Preset Toolbar */}
      <div
        aria-label="3D camera view presets"
        className="oat-hud-top-right"
        role="group"
      >
        {(["iso", "top", "side"] as const).map((preset) => (
          <button
            aria-pressed={cameraPreset === preset}
            className="oat-hud-cam-btn"
            key={preset}
            onClick={() => applyCameraPreset(preset)}
            type="button"
          >
            {preset === "iso" ? "Iso" : preset === "top" ? "Top" : "Side"}
          </button>
        ))}
        <button
          aria-label="Reset 3D camera"
          className="oat-hud-cam-btn oat-hud-cam-btn--icon"
          onClick={() => applyCameraPreset("iso")}
          title="Reset camera"
          type="button"
        >
          <RotateCcw size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Bottom-Left Colorbar or 3D Radar Legend */}
      <div className="oat-hud-legend" data-testid="lab-colorbar-legend">
        {legendSpec ? (
          <>
            <div className="oat-hud-legend-title">{legendSpec.title}</div>
            <div
              className="oat-hud-legend-bar"
              style={{ background: legendSpec.gradient }}
            />
            <div className="oat-hud-legend-ticks oat-tabular">
              <span>{legendSpec.minLabel}</span>
              <span>{legendSpec.maxLabel}</span>
            </div>
          </>
        ) : (
          <div className="oat-hud-radar-legend">
            <div className="oat-hud-legend-title">Airspace Legend</div>
            <div className="oat-hud-radar-items">
              <span className="oat-hud-radar-item">
                <span className="oat-hud-swatch oat-hud-swatch--tx" />
                Tx
              </span>
              {radarBistatic ? (
                <span className="oat-hud-radar-item">
                  <span className="oat-hud-swatch oat-hud-swatch--rx" />
                  Rx
                </span>
              ) : null}
              <span className="oat-hud-radar-item">
                <span className="oat-hud-swatch oat-hud-swatch--los" />
                LoS Link
              </span>
              <span className="oat-hud-radar-item">
                <span className="oat-hud-swatch oat-hud-swatch--sector" />
                Sector
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
