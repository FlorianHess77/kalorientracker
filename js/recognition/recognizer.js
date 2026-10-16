/**
 * Foto-Erkennung direkt im Browser – kostenlos, die Fotos verlassen das Gerät nicht.
 *
 * Modell: Google "AIY Vision Classifier Food V1" (TFLite, ca. 2000 Gerichte),
 * ausgeführt mit TensorFlow.js TFLite (WebAssembly).
 *
 * Ladereihenfolge: zuerst lokale Dateien (vom GitHub-Workflow bzw. Skript abgelegt),
 * sonst direkt von Google bzw. vom CDN.
 *
 * Grenzen: erkennt Gerichte (Schnitzel, Pizza …), keine Einzelzutaten wie Banane;
 * ein Ergebnis pro Foto; keine Grammschätzung.
 */

import { FOOD_CLASSES } from '../data/food-classes.js';
import { loadBitmap, squareCanvas } from '../lib/image.js';
import { THRESHOLDS, buildOnDeviceResult, toScores, topK, validateResult } from './postprocess.js';

const ROOT = new URL('../../', import.meta.url);
const local = (path) => new URL(path, ROOT).href;

const MODEL_VERSION = 'aiy_food_V1';
const MODEL_SOURCES = [
  local('models/aiy_food_V1.tflite'),
  'https://storage.googleapis.com/tfhub-lite-models/google/lite-model/aiy/vision/classifier/food_V1/1.tflite',
];
const LABEL_SOURCES = [
  { url: local('models/aiy_food_V1_labels.json'), type: 'json' },
  { url: 'https://www.gstatic.com/aihub/tfhub/labelmaps/aiy_food_V1_labelmap.csv', type: 'csv' },
];
// Fallback, falls die Dateien nicht mit veröffentlicht wurden (Versionen wie im Build geprüft)
const CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow';
const TFJS_VERSION = '4.22.0';
const TFLITE_VERSION = '0.0.1-alpha.10';
const CDN_WASM = `${CDN}/tfjs-tflite@${TFLITE_VERSION}/wasm/`;
const LIBS = [
  [local('vendor/tfjs/tf-core.min.js'), `${CDN}/tfjs-core@${TFJS_VERSION}/dist/tf-core.min.js`],
  [local('vendor/tfjs/tf-backend-cpu.min.js'), `${CDN}/tfjs-backend-cpu@${TFJS_VERSION}/dist/tf-backend-cpu.min.js`],
  [local('vendor/tfjs/tf-tflite.min.js'), `${CDN}/tfjs-tflite@${TFLITE_VERSION}/dist/tf-tflite.min.js`],
];

export class RecognitionUnavailable extends Error {}

let enginePromise = null;
let status = 'idle'; // idle | loading | ready | failed

export const recognizerStatus = () => status;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve(src);
    s.onerror = () => { s.remove(); reject(new Error(`Skript nicht ladbar: ${src}`)); };
    document.head.appendChild(s);
  });
}

async function loadLibs() {
  if (globalThis.tflite?.loadTFLiteModel) return local('vendor/tfjs/');
  let usedLocal = true;
  for (const [localSrc, cdnSrc] of LIBS) {
    try {
      if (!usedLocal) throw new Error('CDN verwenden');
      await loadScript(localSrc);
    } catch {
      usedLocal = false;
      await loadScript(cdnSrc);
    }
  }
  if (!usedLocal) return CDN_WASM;
  // Lokale WebAssembly-Dateien nur verwenden, wenn sie wirklich mit veröffentlicht wurden
  const ok = await fetch(local('vendor/tfjs/tflite_web_api_cc_simd.js'), { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  return ok ? local('vendor/tfjs/') : CDN_WASM;
}

async function fetchFirst(sources, read) {
  let lastError;
  for (const src of sources) {
    try {
      const url = typeof src === 'string' ? src : src.url;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await read(res, src);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('keine Quelle');
}

export function parseLabelCsv(csv) {
  const labels = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const comma = line.indexOf(',');
    const id = Number(line.slice(0, comma));
    if (Number.isInteger(id)) labels[id] = line.slice(comma + 1).replace(/"/g, '').trim();
  }
  return Array.from(labels, (l) => l ?? '');
}

async function createEngine() {
  status = 'loading';
  try {
    const wasmPath = await loadLibs();
    const { tf, tflite } = globalThis;
    tflite.setWasmPath(wasmPath);

    const [modelBuffer, labels] = await Promise.all([
      fetchFirst(MODEL_SOURCES, (res) => res.arrayBuffer()),
      fetchFirst(LABEL_SOURCES, async (res, src) => (src.type === 'json' ? res.json() : parseLabelCsv(await res.text()))),
    ]);
    const model = await tflite.loadTFLiteModel(modelBuffer);
    const input = model.inputs[0];
    const [, height = 224, width = 224] = input.shape ?? [];
    status = 'ready';
    return { tf, model, labels, inputDtype: input.dtype, width, height };
  } catch (e) {
    status = 'failed';
    enginePromise = null;
    console.error('Foto-Erkennung nicht verfügbar:', e);
    throw new RecognitionUnavailable(
      'Die Foto-Erkennung konnte nicht geladen werden. Prüfe deine Internetverbindung (beim ersten Mal nötig) oder trag das Essen über Suche oder Barcode ein.',
    );
  }
}

/** Modell vorab laden, damit das erste Foto schnell geht */
export function warmUp() {
  enginePromise ??= createEngine();
  return enginePromise;
}

/**
 * @param {Blob|File} file Foto
 * @returns Ergebnis im gemeinsamen Format (siehe postprocess.js)
 */
export async function recognizeFood(file) {
  const started = performance.now();
  const engine = await warmUp();
  const { tf, model, labels, inputDtype, width, height } = engine;

  const bitmap = await loadBitmap(file);
  const canvas = squareCanvas(bitmap, width, height);
  bitmap.close?.();

  const inputTensor = tf.tidy(() => {
    const pixels = tf.browser.fromPixels(canvas).expandDims(0); // int32, 0..255
    return inputDtype === 'float32' ? tf.div(tf.cast(pixels, 'float32'), 255) : tf.cast(pixels, 'int32');
  });
  let output;
  try {
    output = model.predict(inputTensor);
    const outTensor = Array.isArray(output) ? output[0] : output;
    const raw = await outTensor.data();
    const scores = toScores(raw, outTensor.dtype);
    const candidates = topK(scores, labels, THRESHOLDS.topK);
    const result = buildOnDeviceResult({
      candidates,
      classes: FOOD_CLASSES,
      modelVersion: MODEL_VERSION,
      durationMs: Math.round(performance.now() - started),
    });
    const errors = validateResult(result);
    if (errors.length) throw new Error(`Ungültiges Ergebnis: ${errors.join(', ')}`);
    return result;
  } finally {
    inputTensor.dispose();
    if (Array.isArray(output)) output.forEach((t) => t.dispose());
    else output?.dispose?.();
  }
}
