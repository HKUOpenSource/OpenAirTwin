function disposeMaterial(material) {
  if (!material) {
    return;
  }
  for (const value of Object.values(material)) {
    if (value?.isTexture) {
      value.dispose();
    }
  }
  material.dispose?.();
}

export function disposeObject3D(object, {removeFromParent = true} = {}) {
  if (!object) {
    return;
  }
  if (removeFromParent) {
    object.removeFromParent?.();
  }
  object.traverse?.((child) => {
    if (child.userData?.assetManaged) {
      return;
    }
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(child.material);
    }
  });
}
