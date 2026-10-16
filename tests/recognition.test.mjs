import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THRESHOLDS, buildOnDeviceResult, decideStatus, isUsableLabel, itemFromCandidate, toScores, topK, validateResult } from '../js/recognition/postprocess.js';
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
    const none = buildOnDeviceResult({ candidates: [{ label: 'Goulash', name: 'Goulash', confidence: 0.05 }], classes: FOOD_CLASSES, modelVersion: 't', durationMs: 1 });
    assert.equal(none.status, 'no_food');
    assert.deepEqual(validateResult(none), []);
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
