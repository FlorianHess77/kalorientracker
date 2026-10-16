/**
 * Zweite Foto-Erkennung mit MobileCLIP (Apple, über Transformers.js) – läuft ebenfalls lokal.
 * Erkennt einzelne Komponenten wie Steak, Pommes, grüne Bohnen anhand des Wortschatzes
 * aus js/data/clip-vocab.js. Modell (~12 MB) und Text-Fingerabdrücke werden beim
 * Veröffentlichen vorbereitet (scripts/prepare-clip.mjs) und beim ersten Foto geladen.
 */

import { cropRegions, dims, regionCanvas } from '../lib/image.js';
import { clipCandidates, softmaxScaled } from './combine.js';

const ROOT = new URL('../../', import.meta.url);
const local = (p) => new URL(p, ROOT).href;
const CDN_TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js';
const SIZE = 256; // Ausschnitte vorab verkleinern; der Prozessor skaliert auf die Modellgröße

let enginePromise = null;
let status = 'idle';
export const clipDiag = { status: 'idle', error: null, lastRun: null };
export const clipStatus = () => status;

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function createEngine() {
  status = 'loading';
  const [vocab, embBuf] = await Promise.all([
    fetch(local('models/clip/vocab.json')).then((r) => { if (!r.ok) throw new Error(`vocab.json: HTTP ${r.status}`); return r.json(); }),
    fetch(local('models/clip/text-embeds.bin')).then((r) => { if (!r.ok) throw new Error(`text-embeds: HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]);
  let T;
  try {
    T = await import(local('vendor/transformers/transformers.min.js'));
  } catch {
    T = await import(CDN_TRANSFORMERS);
  }
  T.env.allowLocalModels = true;
  T.env.allowRemoteModels = false;
  T.env.localModelPath = local('models/clip/');
  const wasm = T.env.backends?.onnx?.wasm;
  if (wasm) {
    wasm.numThreads = 1; // ohne "cross-origin isolation" (GitHub Pages) gibt es keine Threads
    if (await exists(local('vendor/ort/ort-wasm-simd-threaded.jsep.wasm')) || await exists(local('vendor/ort/ort-wasm-simd-threaded.wasm'))) {
      wasm.wasmPaths = local('vendor/ort/');
    }
  }
  const processor = await T.AutoProcessor.from_pretrained(vocab.model);
  // genaueste Variante zuerst; falls der Browser sie nicht ausführen kann, die nächste
  let model = null;
  let lastError = null;
  for (const dtype of vocab.dtypes ?? [vocab.dtype ?? 'fp32']) {
    try {
      model = await T.CLIPVisionModelWithProjection.from_pretrained(vocab.model, { dtype, device: 'wasm' });
      // Probelauf, damit Fehler bei der Ausführung hier auffallen und nicht erst beim Foto
      const probe = new T.RawImage(new Uint8ClampedArray(64 * 64 * 4).fill(128), 64, 64, 4);
      await model(await processor(probe));
      clipDiag.dtype = dtype;
      break;
    } catch (e) {
      lastError = e;
      clipDiag.dtypeErrors = { ...(clipDiag.dtypeErrors ?? {}), [dtype]: String(e?.message ?? e).slice(0, 200) };
      model = null;
    }
  }
  if (!model) throw lastError ?? new Error('Kein CLIP-Modell ladbar');
  const embeds = new Float32Array(embBuf);
  if (embeds.length !== vocab.items.length * vocab.dim) throw new Error('Text-Fingerabdrücke passen nicht zum Wortschatz');
  status = 'ready';
  clipDiag.status = 'ready';
  return { T, processor, model, embeds, dim: vocab.dim, items: vocab.items, scale: vocab.scale ?? 100 };
}

export function warmUpClip() {
  enginePromise ??= createEngine().catch((e) => {
    status = 'failed';
    clipDiag.status = 'failed';
    clipDiag.error = String(e?.message ?? e);
    enginePromise = null;
    throw e;
  });
  return enginePromise;
}

/**
 * Foto auswerten. Liefert { components, candidates, nonFood } mit Verweisen auf Lebensmittel.
 * @param src ImageBitmap oder Canvas
 */
export async function classifyPhoto(src, { lowMemory = false } = {}) {
  const started = performance.now();
  const engine = await warmUpClip();
  const { T, processor, model, embeds, dim, items, scale } = engine;
  const { w, h } = dims(src);
  // ganzes Foto, Mitte und vier Viertel (ohne Spiegelung / ohne engen Ausschnitt)
  const all = cropRegions(w, h).filter(([, , , flip], i) => !flip && i !== 3);
  const regions = lowMemory ? all.slice(0, 2) : all;
  const probSets = [];
  for (const [sx, sy, size] of regions) {
    const canvas = regionCanvas(src, sx, sy, size, SIZE, SIZE);
    const { data } = canvas.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    const image = new T.RawImage(new Uint8ClampedArray(data), SIZE, SIZE, 4);
    const inputs = await processor(image);
    const { image_embeds } = await model(inputs);
    const v = image_embeds.normalize().data;
    const dots = new Float32Array(items.length);
    for (let k = 0; k < items.length; k++) {
      let s = 0;
      const off = k * dim;
      for (let j = 0; j < dim; j++) s += embeds[off + j] * v[j];
      dots[k] = s;
    }
    probSets.push(softmaxScaled(dots, scale));
    image_embeds.dispose?.();
  }
  const result = clipCandidates(probSets, items);
  clipDiag.lastRun = { at: new Date().toISOString(), ms: Math.round(performance.now() - started), crops: probSets.length, components: result.components, top: result.candidates.slice(0, 4), nonFood: Math.round(result.nonFood * 100) / 100 };
  return result;
}
