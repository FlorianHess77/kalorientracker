/**
 * Foto-Gedächtnis: Die App lernt aus deinen bestätigten Fotos.
 *
 * Zu jedem gespeicherten Foto-Eintrag merkt sie sich den "Fingerabdruck" der Erkennung
 * (welche der ~2000 Gerichte das Modell wie wahrscheinlich fand – kein Bild) und was du
 * tatsächlich eingetragen hast. Ein neues Foto mit ähnlichem Fingerabdruck bekommt dann
 * deine eigenen Einträge als Vorschlag – auch für Gerichte, die das Modell gar nicht kennt.
 *
 * Reine Funktionen, getestet.
 */

export const MEMORY_DEFAULTS = Object.freeze({
  keep: 64, // so viele Werte pro Fingerabdruck speichern (der Rest ist praktisch 0)
  threshold: 0.55, // ab dieser Ähnlichkeit (0..1) wird ein früheres Essen vorgeschlagen
  limit: 3,
  maxEntries: 400,
});

/** Volle Wahrscheinlichkeiten → kompakter, normierter Fingerabdruck { i: [Index], v: [Wert] } */
export function compactVector(scores, keep = MEMORY_DEFAULTS.keep) {
  const pairs = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) pairs.push([i, scores[i]]);
  pairs.sort((a, b) => b[1] - a[1]);
  const top = pairs.slice(0, keep);
  const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
  return { i: top.map(([i]) => i), v: top.map(([, v]) => Math.round((v / sum) * 1e5) / 1e5) };
}

/** Ähnlichkeit zweier Fingerabdrücke (Bhattacharyya-Koeffizient, 0 = verschieden, 1 = gleich) */
export function similarity(a, b) {
  if (!a?.i?.length || !b?.i?.length) return 0;
  const map = new Map();
  a.i.forEach((idx, k) => map.set(idx, a.v[k]));
  let bc = 0;
  b.i.forEach((idx, k) => {
    const va = map.get(idx);
    if (va) bc += Math.sqrt(va * b.v[k]);
  });
  return Math.min(1, bc);
}

/** Frühere Fotos finden, die dem neuen ähneln. Gleiche Zusammenstellungen nur einmal. */
export function findMatches(vector, entries, { threshold = MEMORY_DEFAULTS.threshold, limit = MEMORY_DEFAULTS.limit } = {}) {
  const scored = entries
    .filter((e) => e.items?.length)
    .map((e) => ({ entry: e, score: similarity(vector, e.vector) }))
    .filter((m) => m.score >= threshold)
    .sort((x, y) => y.score - x.score || (y.entry.date ?? '').localeCompare(x.entry.date ?? ''));
  const seen = new Set();
  const out = [];
  for (const m of scored) {
    const key = m.entry.items.map((it) => it.name.toLowerCase()).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: m.entry.id, date: m.entry.date, items: m.entry.items, similarity: Math.round(m.score * 100) / 100 });
    if (out.length >= limit) break;
  }
  return out;
}

/** Nur die Felder speichern, die für einen späteren Vorschlag gebraucht werden */
export function memoryItems(items) {
  return items
    .filter((it) => it.per100g && it.grams > 0)
    .map(({ name, grams, per100g, portions = null, servingG = null, label = null, foodRef = null }) =>
      ({ name, grams, per100g, portions, servingG, label, foodRef }));
}
