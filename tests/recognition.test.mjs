import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THRESHOLDS, aggregateCrops, buildOnDeviceResult, decideStatus, isUsableLabel, itemFromCandidate, toScores, topK, validateResult } from '../js/recognition/postprocess.js';
import { parseLabelCsv } from '../js/recognition/recognizer.js';
import { FOOD_CLASSES } from '../js/data/food-classes.js';

const LABELS = ['__background__', 'Schnitzel', '/m/0100fwt6', 'Goulash', 'Spätzle', 'Pizza bagel'];

describe('Erkennung: Auswertung', () => {
  test('unbrauchbare Labels', () => {
    for (const l of ['__background__', '/m/0100fwt6', '/g/11b8_rxx4d', '']) assert.equal(isUsableLabel(l), false);
    assert.equal(isUsableLabel('Schnitzel'), true);
  });

  test('Scores skalieren', () => {
    const q = toScores(new Int32Array([0, 255, 128]), 'int32');
    assert.equal(q[0], 0);
    assert.ok(Math.abs(q[1] - 1) < 1e-6);
    const f = toScores(new Float32Array([0.25]), 'float32');
    assert.ok(Math.abs(f[0] - 0.25) < 1e-6);
  });

  test('topK sortiert und filtert', () => {
    const r = topK([0.99, 0.6, 0.95, 0.2, 0.1, 0.05], LABELS, 3);
    assert.deepEqual(r.map((c) => c.label), ['Schnitzel', 'Goulash', 'Spätzle']);
    assert.equal(topK([0.5, 0.5], ['__background__', 'Schnitzel'], 5).length, 1);
  });

  test('Status-Entscheidung', () => {
    const c = (confidence) => ({ label: 'x', name: 'x', confidence });
    assert.equal(decideStatus([]), 'no_food');
    assert.equal(decideStatus([c(THRESHOLDS.minFood - 0.01)]), 'no_food');
    assert.equal(decideStatus([c(0.4), c(0.1)]), 'uncertain');
    assert.equal(decideStatus([c(0.55), c(0.45)]), 'uncertain');
    assert.equal(decideStatus([c(0.8), c(0.1)]), 'ok');
  });

  test('Ergebnis mit hinterlegten Nährwerten', () => {
    const r = buildOnDeviceResult({
      candidates: [{ label: 'Schnitzel', name: 'Schnitzel', confidence: 0.82 }, { label: 'Goulash', name: 'Goulash', confidence: 0.05 }],
      classes: FOOD_CLASSES, modelVersion: 't', durationMs: 5,
    });
    assert.deepEqual(validateResult(r), []);
    assert.equal(r.status, 'ok');
    assert.equal(r.items[0].name, 'Schnitzel (paniert)');
    assert.equal(r.items[0].per100g.kcal, 235);
    assert.equal(r.items[0].estimatedGrams, null);
    assert.equal(r.alternatives[0].name, 'Gulasch');
  });

  test('Ergebnis ohne Nährwerte und ohne Essen', () => {
    const unknown = buildOnDeviceResult({ candidates: [{ label: 'Pizza bagel', name: 'Pizza bagel', confidence: 0.9 }], classes: FOOD_CLASSES, modelVersion: 't', durationMs: 1 });
    assert.equal(unknown.items[0].per100g, null);
    assert.deepEqual(validateResult(unknown), []);
    const none = buildOnDeviceResult({ candidates: [{ label: 'Goulash', name: 'Goulash', confidence: 0.02 }], classes: FOOD_CLASSES, modelVersion: 't', durationMs: 1 });
    assert.equal(none.status, 'no_food');
    assert.deepEqual(validateResult(none), []);
  });

  test('Gemischter Teller: Ausschnitte ergeben mehrere Komponenten', () => {
    const labels = ['__background__', 'Roast beef', 'Schupfnudel', 'Coleslaw', 'Sauerbraten'];
    const sets = [
      [0, 0.07, 0.05, 0.02, 0.04], // ganzes Foto: unsicher
      [0, 0.45, 0.10, 0.01, 0.20], // Ausschnitt mit Fleisch
      [0, 0.05, 0.62, 0.03, 0.02], // Ausschnitt mit Schupfnudeln
      [0, 0.02, 0.04, 0.38, 0.01], // Ausschnitt mit Salat
    ];
    const { candidates, components } = aggregateCrops(sets, labels);
    assert.deepEqual(components.map((c) => c.label), ['Schupfnudel', 'Roast beef', 'Coleslaw']);
    assert.equal(candidates[0].label, 'Schupfnudel');
    const r = buildOnDeviceResult({ candidates, components, classes: FOOD_CLASSES, modelVersion: 't', durationMs: 1 });
    assert.equal(r.status, 'uncertain');
    assert.deepEqual(r.items.map((i) => i.name), ['Schupfnudeln', 'Roastbeef', 'Krautsalat (cremig)']);
    assert.ok(r.items.every((i) => i.per100g));
    assert.ok(!r.alternatives.some((a) => ['Schupfnudel', 'Roast beef', 'Coleslaw'].includes(a.label)));
    assert.deepEqual(validateResult(r), []);
  });

  test('Eindeutiges Gericht bleibt ein einzelner Eintrag', () => {
    const labels = ['__background__', 'Schnitzel', 'Goulash'];
    const sets = [[0, 0.9, 0.05], [0, 0.85, 0.1], [0, 0.8, 0.1]];
    const { candidates, components } = aggregateCrops(sets, labels);
    const r = buildOnDeviceResult({ candidates, components, classes: FOOD_CLASSES, modelVersion: 't', durationMs: 1 });
    assert.equal(r.status, 'ok');
    assert.equal(r.items.length, 1);
    assert.equal(aggregateCrops([], labels).candidates.length, 0);
  });

  test('Rückfrage-Auswahl übernimmt Portionen', () => {
    const it = itemFromCandidate({ label: 'Goulash', name: 'Goulash', confidence: 0.3 }, FOOD_CLASSES);
    assert.equal(it.name, 'Gulasch');
    assert.equal(it.portions.medium_g, 300);
  });

  test('validateResult erkennt Fehler', () => {
    assert.ok(validateResult({ provider: 'x', status: 'ok', items: [], alternatives: [] }).length > 0);
    assert.ok(validateResult({ provider: 'server', status: 'ok', items: [{ name: 'a', confidence: 2, estimatedGrams: null }], alternatives: [] }).includes('item'));
  });

  test('Labelliste aus CSV', () => {
    const labels = parseLabelCsv('id,name\n0,__background__\n2,Schnitzel\n3,"""Peanut butter"\n');
    assert.deepEqual(labels, ['__background__', '', 'Schnitzel', 'Peanut butter']);
  });
});

describe('Projektdateien', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

  test('Service Worker kennt alle App-Dateien', () => {
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    const listed = new Set([...sw.matchAll(/'((?:js|css|assets)\/[^']+)'/g)].map((m) => m[1]));
    const actual = walk(join(root, 'js')).map((p) => relative(root, p).split('\\').join('/'));
    for (const f of actual) assert.ok(listed.has(f), `fehlt im Service Worker: ${f}`);
    for (const f of listed) assert.ok(statSync(join(root, f)).isFile(), `existiert nicht: ${f}`);
  });

  test('Alle Views exportieren render()', async () => {
    const main = readFileSync(join(root, 'js/main.js'), 'utf8');
    const routes = [...main.matchAll(/import\('\.\/views\/(\w+)\.js'\)/g)].map((m) => m[1]);
    assert.ok(routes.length >= 10);
    for (const r of routes) {
      const src = readFileSync(join(root, `js/views/${r}.js`), 'utf8');
      assert.match(src, /export (async )?function render\(/, r);
    }
  });
});

describe('Erkennung: Rohwerte normalisieren', () => {
  test('Wahrscheinlichkeiten bleiben, Logits werden zu Softmax', async () => {
    const { normalizeScores } = await import('../js/recognition/recognizer.js');
    const p = new Float32Array([0.7, 0.2, 0.1]);
    assert.equal(normalizeScores(p, 'float32'), p);
    const s = normalizeScores(new Float32Array([2, 1, -1]), 'float32');
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-5);
    assert.ok(s[0] > s[1] && s[1] > s[2]);
    const q = new Float32Array([0.5]);
    assert.equal(normalizeScores(q, 'int32'), q);
  });
});

describe('Foto-Gedächtnis', () => {
  test('Fingerabdruck, Ähnlichkeit und Vorschläge', async () => {
    const { compactVector, similarity, findMatches, memoryItems } = await import('../js/recognition/memory.js');
    const braten = compactVector(new Float32Array([0, 0.3, 0.25, 0.2, 0.05, 0.01]));
    const bratenNochmal = compactVector(new Float32Array([0, 0.28, 0.3, 0.15, 0.04, 0.02]));
    const pizza = compactVector(new Float32Array([0, 0.01, 0.0, 0.02, 0.9, 0.05]));
    assert.ok(Math.abs(braten.v.reduce((a, b) => a + b, 0) - 1) < 1e-3);
    assert.ok(Math.abs(similarity(braten, braten) - 1) < 1e-3);
    assert.ok(similarity(braten, bratenNochmal) > 0.9);
    assert.ok(similarity(braten, pizza) < 0.4);
    assert.equal(similarity(null, braten), 0);

    const item = (name, grams) => ({ name, grams, per100g: { kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 3 } });
    const entries = [
      { id: 'a', date: '2026-10-12', vector: braten, items: [item('Roastbeef', 150), item('Schupfnudeln', 250)] },
      { id: 'b', date: '2026-10-14', vector: braten, items: [item('Schupfnudeln', 200), item('Roastbeef', 150)] },
      { id: 'c', date: '2026-10-13', vector: pizza, items: [item('Pizza', 300)] },
    ];
    const m = findMatches(bratenNochmal, entries);
    assert.equal(m.length, 1, 'gleiche Zusammenstellung nur einmal');
    assert.equal(m[0].id, 'b', 'neuester Eintrag zuerst');
    assert.deepEqual(findMatches(pizza, entries.slice(0, 2)), []);
    assert.deepEqual(memoryItems([item('A', 100), { name: 'ohne', grams: 10, per100g: null }]).map((i) => i.name), ['A']);
  });
});
