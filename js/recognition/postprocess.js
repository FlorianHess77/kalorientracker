/**
 * Auswertung der Modell-Ausgabe – reine Funktionen, getestet.
 *
 * Ergebnisformat (gleich für jede Erkennungsvariante, auch eine spätere Server-KI):
 * {
 *   provider: 'on-device' | 'server',
 *   modelVersion: string,
 *   status: 'ok' | 'uncertain' | 'no_food',
 *   items: [{ label, name, confidence, estimatedGrams|null, per100g|null, portions|null }],
 *   alternatives: [{ label, name, confidence }],
 *   durationMs: number
 * }
 */

export const THRESHOLDS = Object.freeze({
  minFood: 0.15, // darunter: "kein Essen erkannt"
  confident: 0.5, // darunter: Rückfrage
  minMargin: 0.15, // Platz 1 und 2 zu knapp beieinander: Rückfrage
  topK: 5,
});

/** Hintergrundklasse und interne Knowledge-Graph-IDs ohne Klarnamen aussortieren */
export function isUsableLabel(label) {
  if (!label) return false;
  if (label.startsWith('__')) return false;
  if (/^\/[mg]\//.test(label)) return false;
  return true;
}

/** Quantisierte Modelle liefern 0..255 (als uint8/int32), Float-Modelle 0..1 */
export function toScores(output, dtype) {
  const scale = dtype === 'float32' ? 1 : 1 / 255;
  const scores = new Float32Array(output.length);
  for (let i = 0; i < output.length; i++) scores[i] = output[i] * scale;
  return scores;
}

export function topK(scores, labels, k) {
  const picked = [];
  const n = Math.min(scores.length, labels.length);
  for (let i = 0; i < n; i++) {
    const label = labels[i];
    if (!isUsableLabel(label)) continue;
    const confidence = Math.max(0, Math.min(1, scores[i]));
    if (picked.length < k || confidence > picked[picked.length - 1].confidence) {
      picked.push({ label, name: label, confidence });
      picked.sort((a, b) => b.confidence - a.confidence);
      if (picked.length > k) picked.pop();
    }
  }
  return picked;
}

export function decideStatus(candidates) {
  const [first, second] = candidates;
  if (!first || first.confidence < THRESHOLDS.minFood) return 'no_food';
  if (first.confidence < THRESHOLDS.confident) return 'uncertain';
  if (second && first.confidence - second.confidence < THRESHOLDS.minMargin) return 'uncertain';
  return 'ok';
}

/**
 * @param {{candidates:Array, classes:Map<string,{nameDe,per100g,portions}>, modelVersion:string, durationMs:number}} p
 */
export function buildOnDeviceResult({ candidates, classes, modelVersion, durationMs }) {
  const named = candidates.map((c) => ({ ...c, name: classes.get(c.label)?.nameDe ?? c.label }));
  const status = decideStatus(named);
  if (status === 'no_food') {
    return { provider: 'on-device', modelVersion, status, items: [], alternatives: named.slice(0, 3), durationMs };
  }
  const [best, ...rest] = named;
  return {
    provider: 'on-device',
    modelVersion,
    status,
    items: [itemFromCandidate(best, classes)],
    alternatives: rest,
    durationMs,
  };
}

export function itemFromCandidate(candidate, classes) {
  const cls = classes.get(candidate.label);
  return {
    ...candidate,
    name: cls?.nameDe ?? candidate.name,
    estimatedGrams: null,
    per100g: cls?.per100g ?? null,
    portions: cls?.portions ?? null,
  };
}

/** Strukturprüfung des Ergebnisses (Ersatz für ein Schema-Paket, da ohne Build-Schritt) */
export function validateResult(r) {
  const errors = [];
  const num01 = (n) => typeof n === 'number' && n >= 0 && n <= 1;
  if (!r || typeof r !== 'object') return ['kein Objekt'];
  if (!['on-device', 'server'].includes(r.provider)) errors.push('provider');
  if (!['ok', 'uncertain', 'no_food'].includes(r.status)) errors.push('status');
  if (!Array.isArray(r.items) || r.items.length > 20) errors.push('items');
  if (!Array.isArray(r.alternatives)) errors.push('alternatives');
  if (r.status === 'no_food' && r.items?.length) errors.push('no_food mit items');
  if (r.status !== 'no_food' && !r.items?.length) errors.push('ok/uncertain ohne items');
  for (const it of r.items || []) {
    if (!it.name || !num01(it.confidence)) errors.push('item');
    if (it.estimatedGrams !== null && !(it.estimatedGrams > 0 && it.estimatedGrams <= 3000)) errors.push('estimatedGrams');
    if (it.per100g) {
      const p = it.per100g;
      if (!(p.kcal >= 0 && p.kcal <= 1000) || [p.protein_g, p.carbs_g, p.fat_g].some((v) => !(v >= 0 && v <= 100))) {
        errors.push('per100g');
      }
    }
  }
  return errors;
}
