import * as THREE from "/lib/three.module.js";
import {disposeObject3D} from "/js/viewer/dispose.js";

export class SceneLayerHandle {
  constructor(manager, featureId, layerId, options = {}) {
    this.manager = manager;
    this.featureId = featureId;
    this.layerId = layerId;
    this.key = `${featureId}:${layerId}`;
    this.group = new THREE.Group();
    this.group.name = `feature-layer:${this.key}`;
    this.group.renderOrder = Number(options.order || 0);
    this.group.visible = options.visible !== false;
    this.group.userData.featureLayer = {
      featureId,
      layerId,
      pickable: options.pickable !== false,
    };
  }

  add(...objects) {
    this.group.add(...objects.filter(Boolean));
    return objects[objects.length - 1] || null;
  }

  replace(object) {
    this.clear();
    if (object) {
      this.add(object);
    }
    return object || null;
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeObject3D(child, {removeFromParent: false});
    }
  }

  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  setPickable(pickable) {
    this.group.userData.featureLayer.pickable = Boolean(pickable);
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
    this.manager._forget(this.key, this);
  }
}

export class SceneLayerManager {
  constructor(scene) {
    this.scene = scene;
    this._layers = new Map();
  }

  create(featureId, layerId, options = {}) {
    const key = `${featureId}:${layerId}`;
    const existing = this._layers.get(key);
    if (existing) {
      return existing;
    }
    const layer = new SceneLayerHandle(this, featureId, layerId, options);
    this._layers.set(key, layer);
    this.scene.add(layer.group);
    return layer;
  }

  get(featureId, layerId) {
    return this._layers.get(`${featureId}:${layerId}`) || null;
  }

  layersFor(featureId) {
    return [...this._layers.values()].filter((layer) => layer.featureId === featureId);
  }

  clearFeature(featureId) {
    for (const layer of this.layersFor(featureId)) {
      layer.clear();
    }
  }

  setFeatureVisible(featureId, visible) {
    for (const layer of this.layersFor(featureId)) {
      layer.setVisible(visible);
    }
  }

  disposeFeature(featureId) {
    for (const layer of [...this.layersFor(featureId)]) {
      layer.dispose();
    }
  }

  dispose() {
    for (const layer of [...this._layers.values()]) {
      layer.dispose();
    }
  }

  _forget(key, layer) {
    if (this._layers.get(key) === layer) {
      this._layers.delete(key);
    }
  }
}
