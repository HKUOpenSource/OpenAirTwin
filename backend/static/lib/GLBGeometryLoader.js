import * as THREE from "/lib/three.module.js";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const COMPONENT_TYPES = {
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};

const COMPONENT_SIZES = {
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_SIZES = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

export class GLBGeometryLoader {
  async loadAsync(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load GLB geometry: ${response.status} ${response.statusText}`);
    }
    return this.parse(await response.arrayBuffer());
  }

  parse(arrayBuffer) {
    const {document, binChunk} = this.#parseGlb(arrayBuffer);
    const primitive = document.meshes?.[0]?.primitives?.[0];
    if (!primitive) {
      throw new Error("GLB document does not contain a mesh primitive");
    }

    const geometry = new THREE.BufferGeometry();
    const position = this.#readAccessor(document, primitive.attributes?.POSITION, binChunk);
    const normal = this.#readAccessor(document, primitive.attributes?.NORMAL, binChunk);
    const index = this.#readAccessor(document, primitive.indices, binChunk);

    geometry.setAttribute("position", new THREE.BufferAttribute(position.array, position.itemSize));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal.array, normal.itemSize));
    geometry.setIndex(new THREE.BufferAttribute(index.array, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  #parseGlb(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 20) {
      throw new Error("GLB payload is too small");
    }

    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const totalLength = view.getUint32(8, true);
    if (magic !== GLB_MAGIC || version !== GLB_VERSION || totalLength !== view.byteLength) {
      throw new Error("Unsupported GLB header");
    }

    let offset = 12;
    let document = null;
    let binChunk = null;
    const decoder = new TextDecoder("utf-8");

    while (offset + 8 <= view.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      const chunk = arrayBuffer.slice(offset, offset + chunkLength);
      offset += chunkLength;

      if (chunkType === JSON_CHUNK_TYPE) {
        document = JSON.parse(decoder.decode(chunk).trim());
      } else if (chunkType === BIN_CHUNK_TYPE) {
        binChunk = chunk;
      }
    }

    if (!document || !binChunk) {
      throw new Error("GLB document is missing JSON or BIN chunk");
    }
    return {document, binChunk};
  }

  #readAccessor(document, accessorIndex, binChunk) {
    if (!Number.isInteger(accessorIndex)) {
      throw new Error("GLB accessor index is missing");
    }

    const accessor = document.accessors?.[accessorIndex];
    if (!accessor) {
      throw new Error("GLB accessor is missing");
    }

    const bufferView = document.bufferViews?.[accessor.bufferView];
    const ArrayType = COMPONENT_TYPES[accessor.componentType];
    const componentSize = COMPONENT_SIZES[accessor.componentType];
    const itemSize = TYPE_SIZES[accessor.type];
    if (!bufferView || !ArrayType || !componentSize || !itemSize) {
      throw new Error("Unsupported GLB accessor layout");
    }

    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const elementCount = accessor.count * itemSize;
    const typed = new ArrayType(binChunk, byteOffset, elementCount);
    const copied = new ArrayType(typed.length);
    copied.set(typed);
    return {array: copied, itemSize, stride: componentSize * itemSize};
  }
}
