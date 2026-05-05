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

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function responseByteMeta(response) {
  const contentEncoding = (response.headers.get("Content-Encoding") || "identity").toLowerCase();
  const contentLengthBytes = finitePositiveNumber(response.headers.get("Content-Length"));
  const originalBytes = finitePositiveNumber(response.headers.get("X-Original-Content-Length"));
  const compressedBytes = finitePositiveNumber(response.headers.get("X-Compressed-Content-Length"));
  const isGzip = contentEncoding.split(",").map((item) => item.trim()).includes("gzip");
  const decodedTotalBytes = originalBytes || (isGzip ? null : contentLengthBytes);
  const transferTotalBytes = compressedBytes || contentLengthBytes;

  return {
    contentEncoding,
    compressed: isGzip && compressedBytes !== null,
    decodedTotalBytes,
    transferTotalBytes,
    originalSizeBytes: originalBytes,
    compressedSizeBytes: compressedBytes,
  };
}

function progressBytes(decodedLoadedBytes, meta) {
  let transferLoadedBytes = decodedLoadedBytes;
  if (meta.transferTotalBytes && meta.decodedTotalBytes) {
    transferLoadedBytes = Math.min(
      meta.transferTotalBytes,
      (decodedLoadedBytes / meta.decodedTotalBytes) * meta.transferTotalBytes,
    );
  } else if (meta.transferTotalBytes && decodedLoadedBytes >= meta.transferTotalBytes && !meta.compressed) {
    transferLoadedBytes = meta.transferTotalBytes;
  }

  return {
    loadedBytes: transferLoadedBytes,
    totalBytes: meta.transferTotalBytes || meta.decodedTotalBytes,
    transferLoadedBytes,
    transferTotalBytes: meta.transferTotalBytes,
    decodedLoadedBytes,
    decodedTotalBytes: meta.decodedTotalBytes,
    originalSizeBytes: meta.originalSizeBytes,
    compressedSizeBytes: meta.compressedSizeBytes,
    contentEncoding: meta.contentEncoding,
    compressed: meta.compressed,
  };
}

export class GLBGeometryLoader {
  async loadAsync(url, {onProgress = () => {}} = {}) {
    const requestStart = performance.now();
    onProgress({
      phase: "waiting",
      loadedBytes: 0,
      totalBytes: null,
      speedBytesPerSec: 0,
      ttfbMs: null,
      downloadMs: 0,
      parseMs: 0,
      streamSupported: Boolean(window.ReadableStream),
    });

    const response = await fetch(url);
    const responseStart = performance.now();
    const ttfbMs = responseStart - requestStart;
    if (!response.ok) {
      throw new Error(`Failed to load GLB geometry: ${response.status} ${response.statusText}`);
    }
    const byteMeta = responseByteMeta(response);

    let arrayBuffer;
    if (response.body?.getReader) {
      arrayBuffer = await this.#readStream(response.body, {
        byteMeta,
        startedAt: responseStart,
        ttfbMs,
        onProgress,
      });
    } else {
      onProgress({
        phase: "downloading",
        ...progressBytes(0, byteMeta),
        speedBytesPerSec: 0,
        ttfbMs,
        downloadMs: 0,
        parseMs: 0,
        streamSupported: false,
      });
      arrayBuffer = await response.arrayBuffer();
      const downloadMs = performance.now() - responseStart;
      const byteProgress = progressBytes(arrayBuffer.byteLength, byteMeta);
      onProgress({
        phase: "downloading",
        ...byteProgress,
        speedBytesPerSec: downloadMs > 0 ? (byteProgress.loadedBytes / downloadMs) * 1000 : 0,
        ttfbMs,
        downloadMs,
        parseMs: 0,
        streamSupported: false,
      });
    }

    const parseStart = performance.now();
    const completeByteProgress = progressBytes(arrayBuffer.byteLength, byteMeta);
    onProgress({
      phase: "parsing",
      ...completeByteProgress,
      speedBytesPerSec: 0,
      ttfbMs,
      downloadMs: parseStart - responseStart,
      parseMs: 0,
      streamSupported: Boolean(response.body?.getReader),
    });
    const geometry = this.parse(arrayBuffer);
    const parseMs = performance.now() - parseStart;
    onProgress({
      phase: "ready",
      ...completeByteProgress,
      speedBytesPerSec: 0,
      ttfbMs,
      downloadMs: parseStart - responseStart,
      parseMs,
      streamSupported: Boolean(response.body?.getReader),
    });
    return geometry;
  }

  async #readStream(body, {byteMeta, startedAt, ttfbMs, onProgress}) {
    const reader = body.getReader();
    const chunks = [];
    let decodedLoadedBytes = 0;
    let lastReportAt = 0;

    while (true) {
      const {done, value} = await reader.read();
      const now = performance.now();
      if (done) {
        break;
      }

      chunks.push(value);
      decodedLoadedBytes += value.byteLength;
      if (now - lastReportAt > 120 || decodedLoadedBytes === byteMeta.decodedTotalBytes) {
        const downloadMs = now - startedAt;
        const byteProgress = progressBytes(decodedLoadedBytes, byteMeta);
        onProgress({
          phase: "downloading",
          ...byteProgress,
          speedBytesPerSec: downloadMs > 0 ? (byteProgress.loadedBytes / downloadMs) * 1000 : 0,
          ttfbMs,
          downloadMs,
          parseMs: 0,
          streamSupported: true,
        });
        lastReportAt = now;
      }
    }

    const finishedAt = performance.now();
    const downloadMs = finishedAt - startedAt;
    const byteProgress = progressBytes(decodedLoadedBytes, byteMeta);
    onProgress({
      phase: "downloading",
      ...byteProgress,
      speedBytesPerSec: downloadMs > 0 ? (byteProgress.loadedBytes / downloadMs) * 1000 : 0,
      ttfbMs,
      downloadMs,
      parseMs: 0,
      streamSupported: true,
    });

    const buffer = new Uint8Array(decodedLoadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return buffer.buffer;
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
