/**
 * Auswertung der zweiten Erkennung (MobileCLIP) – reine Funktionen, getestet.
 * CLIP bewertet jeden Bildausschnitt gegen den Wortschatz aus clip-vocab.js.
 * Mehrere Begriffe können auf dasselbe Lebensmittel zeigen; deren Werte werden addiert.
 */

export const CLIP_THRESHOLDS = Object.freeze({
  component: 0.25, // so sicher muss ein Ausschnitt sein, damit er als eigene Komponente zählt
  maxComponents: 4,
  maxCandidates: 8,
  nonFood: 0.5, // ab diesem Anteil "kein Essen" auf dem ganzen Foto
});

/** Wahrscheinlichkeiten je Begriff → je Lebensmittel (Summe), plus Anteil "kein Essen" */
export function byRef(probs, items) {
  const map = new Map();
  let nonFood = 0;
  items.forEach((it, i) => {
    if (!it.ref) nonFood += probs[i];
    else map.set(it.ref, (map.get(it.ref) ?? 0) + probs[i]);
  });
  return { map, nonFood };
}

/**
 * @param probSets Wahrscheinlichkeiten je Ausschnitt; probSets[0] = ganzes Foto
 * @param items Wortschatz [{ term, ref }]
 */
export function clipCandidates(probSets, items) {
  if (!probSets.length) return { components: [], candidates: [], nonFood: 0 };
  const perCrop = probSets.map((p) => byRef(p, items));
  const best = new Map();
  for (const { map } of perCrop) for (const [ref, p] of map) best.set(ref, Math.max(best.get(ref) ?? 0, p));

  const comps = new Map();
  for (const { map } of perCrop) {
    let top = null;
    for (const [ref, p] of map) if (!top || p > top[1]) top = [ref, p];
    if (top && top[1] >= CLIP_THRESHOLDS.component) comps.set(top[0], Math.max(comps.get(top[0]) ?? 0, top[1]));
  }
  const components = [...comps]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CLIP_THRESHOLDS.maxComponents)
    .map(([ref, confidence]) => ({ ref, confidence: Math.min(1, confidence) }));
  const candidates = [...best]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CLIP_THRESHOLDS.maxCandidates)
    .map(([ref, confidence]) => ({ ref, confidence: Math.min(1, confidence) }));
  return { components, candidates, nonFood: perCrop[0].nonFood };
}

export function softmaxScaled(dots, scale = 100) {
  let max = -Infinity;
  for (const d of dots) max = Math.max(max, d * scale);
  const out = new Float32Array(dots.length);
  let sum = 0;
  for (let i = 0; i < dots.length; i++) { out[i] = Math.exp(dots[i] * scale - max); sum += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}
