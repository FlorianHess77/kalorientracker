import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_KCAL, ageOn, bmi, calculateGoals, canChooseLose, checkManualGoals, kcalFromMacros, macrosFor, mifflinStJeor, waterFor,
} from '../js/lib/calc.js';
import {
  addDays, daysBetween, formatDayLabel, isValidISODate, mealTypeForTime, parseDecimal, toISODate,
} from '../js/lib/dates.js';
import { dayTotals, isPlausiblePer100g, macroSplit, nutrientsForGrams, per100gFrom, sumNutrients, withGrams } from '../js/lib/nutrition.js';
import { computeStreak, dailySeries, filterFoods, isOnTarget, recentItems, summarize, weightChange } from '../js/lib/stats.js';
import { buildICS, mealsToCSV, toCSV, validateBackup } from '../js/lib/export.js';
import { niceTicks, barChart, lineChart } from '../js/lib/charts.js';
import { productToFood } from '../js/off.js';
import { GENERIC_FOODS } from '../js/data/generic-foods.js';
import { FOOD_CLASSES, DISH_FOODS } from '../js/data/food-classes.js';

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('Zielberechnung', () => {
  test('Mifflin-St Jeor', () => {
    assert.equal(mifflinStJeor('male', 80, 180, 30), 1780);
    close(mifflinStJeor('female', 60, 165, 25), 1345.25);
  });

  test('Alter zählt erst ab dem Geburtstag', () => {
    assert.equal(ageOn(new Date(2000, 9, 17), new Date(2026, 9, 16)), 25);
    assert.equal(ageOn(new Date(2000, 9, 16), new Date(2026, 9, 16)), 26);
  });

  test('Standardfall: Abnehmen 0,5 kg/Woche', () => {
    const r = calculateGoals({ basis: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'moderate', goal: 'lose', weeklyRateKg: 0.5 });
    assert.equal(r.bmr, 1780);
    assert.equal(r.tdee, 2759);
    assert.equal(r.dailyDelta, -550);
    assert.equal(r.kcal, 2210);
    assert.deepEqual([r.protein_g, r.carbs_g, r.fat_g], [144, 270, 61]);
    assert.deepEqual(r.warnings, []);
  });

  test('Mindestkalorien werden nie unterschritten', () => {
    const r = calculateGoals({ basis: 'female', weightKg: 60, heightCm: 165, age: 25, activity: 'sedentary', goal: 'lose', weeklyRateKg: 1 });
    assert.equal(r.kcal, MIN_KCAL.female);
    assert.ok(r.warnings.includes('clamped_to_minimum'));
    assert.ok(r.warnings.includes('aggressive_rate'));
  });

  test('Bei Untergewicht kein Abnehmziel', () => {
    const r = calculateGoals({ basis: 'female', weightKg: 48, heightCm: 170, age: 22, activity: 'light', goal: 'lose', weeklyRateKg: 0.5 });
    assert.equal(r.effectiveGoal, 'maintain');
    assert.equal(r.dailyDelta, 0);
    assert.ok(r.warnings.includes('underweight_no_loss'));
  });

  test('Zunehmen und Halten', () => {
    const gain = calculateGoals({ basis: 'male', weightKg: 70, heightCm: 178, age: 28, activity: 'active', goal: 'gain', weeklyRateKg: 0.25 });
    assert.equal(gain.dailyDelta, 275);
    const keep = calculateGoals({ basis: 'male', weightKg: 80, heightCm: 180, age: 30, activity: 'moderate', goal: 'maintain', weeklyRateKg: 1 });
    assert.equal(keep.dailyDelta, 0);
    assert.equal(keep.kcal, 2760);
  });

  test('Makros passen zu den Kalorien', () => {
    for (const weightKg of [55, 75, 95, 140]) {
      const r = calculateGoals({ basis: 'female', weightKg, heightCm: 168, age: 45, activity: 'light', goal: 'lose', weeklyRateKg: 0.5 });
      assert.ok(Math.abs(kcalFromMacros(r) - r.kcal) < 15, `Gewicht ${weightKg}`);
      assert.ok(r.carbs_g > 0);
    }
  });

  test('Eiweiß max. 30 % der Kalorien', () => {
    assert.equal(macrosFor(1500, 140, 'lose').protein_g, 113);
  });

  test('Hilfsfunktionen', () => {
    close(bmi(80, 200), 20);
    assert.equal(canChooseLose(50, 170), false);
    assert.equal(canChooseLose(60, 170), true);
    assert.equal(waterFor(80), 2750);
    assert.equal(waterFor(30), 1500);
    assert.equal(waterFor(200), 4000);
  });

  test('Manuelle Ziele prüfen', () => {
    assert.ok(checkManualGoals(1000, { protein_g: 50, carbs_g: 120, fat_g: 35 }, 'female').includes('below_minimum'));
    assert.deepEqual(checkManualGoals(2000, { protein_g: 150, carbs_g: 200, fat_g: 67 }, 'male'), []);
    assert.deepEqual(checkManualGoals(2000, { protein_g: 50, carbs_g: 50, fat_g: 20 }, 'male'), ['macro_mismatch']);
    assert.ok(checkManualGoals(NaN, { protein_g: 0, carbs_g: 0, fat_g: 0 }, 'male').includes('below_minimum'));
  });
});

describe('Datum', () => {
  test('Tage addieren über Monats- und Jahresgrenzen', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });
  test('daysBetween', () => {
    assert.deepEqual(daysBetween('2026-10-14', '2026-10-16'), ['2026-10-14', '2026-10-15', '2026-10-16']);
  });
  test('Beschriftungen', () => {
    assert.equal(formatDayLabel('2026-10-16', '2026-10-16'), 'Heute');
    assert.equal(formatDayLabel('2026-10-15', '2026-10-16'), 'Gestern');
    assert.equal(formatDayLabel('2026-10-12', '2026-10-16'), 'Mo, 12. Okt.');
  });
  test('Eingaben prüfen', () => {
    assert.equal(isValidISODate('2024-02-29'), true);
    assert.equal(isValidISODate('2023-02-29'), false);
    assert.equal(isValidISODate('abc'), false);
    assert.equal(parseDecimal('72,5'), 72.5);
    assert.ok(Number.isNaN(parseDecimal('')));
    assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
  });
  test('Mahlzeit nach Uhrzeit', () => {
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 7, 30)), 'breakfast');
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 12, 0)), 'lunch');
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 19, 0)), 'dinner');
    assert.equal(mealTypeForTime(new Date(2026, 0, 1, 16, 0)), 'snack');
  });
});

describe('Nährwerte', () => {
  const per100g = { kcal: 235, protein_g: 17, carbs_g: 13, fat_g: 13 };
  test('Portion umrechnen', () => {
    assert.deepEqual(nutrientsForGrams(per100g, 180), { kcal: 423, protein_g: 30.6, carbs_g: 23.4, fat_g: 23.4 });
    assert.equal(nutrientsForGrams(per100g, -5).kcal, 0);
  });
  test('Rückrechnung auf 100 g', () => {
    assert.deepEqual(per100gFrom({ kcal: 300, protein_g: 15, carbs_g: 30, fat_g: 12 }, 150), { kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 8 });
    assert.throws(() => per100gFrom({ kcal: 1, protein_g: 0, carbs_g: 0, fat_g: 0 }, 0));
  });
  test('Summen und Menge ändern', () => {
    const a = { name: 'A', per100g, grams: 100, ...nutrientsForGrams(per100g, 100) };
    const b = withGrams(a, 200);
    assert.equal(b.kcal, 470);
    assert.deepEqual(sumNutrients([a, b]), { kcal: 705, protein_g: 51, carbs_g: 39, fat_g: 39 });
    assert.equal(dayTotals([{ items: [a] }, { items: [b] }]).kcal, 705);
    assert.equal(withGrams({ name: 'fest', kcal: 99, grams: 1 }, 50).kcal, 99);
  });
  test('Makro-Anteile ergeben 100 %', () => {
    const s = macroSplit({ protein_g: 100, carbs_g: 200, fat_g: 70 });
    assert.equal(s.protein + s.carbs + s.fat, 100);
    assert.deepEqual(macroSplit({ protein_g: 0, carbs_g: 0, fat_g: 0 }), { protein: 0, carbs: 0, fat: 0 });
  });
  test('Plausibilität', () => {
    assert.equal(isPlausiblePer100g(per100g), true);
    assert.equal(isPlausiblePer100g({ kcal: 5000, protein_g: 1, carbs_g: 1, fat_g: 1 }), false);
    assert.equal(isPlausiblePer100g({ kcal: 300, protein_g: 60, carbs_g: 60, fat_g: 10 }), false);
    assert.equal(isPlausiblePer100g(null), false);
  });
  test('Alle mitgelieferten Lebensmittel sind plausibel', () => {
    for (const f of [...GENERIC_FOODS, ...DISH_FOODS]) assert.ok(isPlausiblePer100g(f.per100g) && f.servingG > 0, f.name);
    const names = GENERIC_FOODS.map((f) => f.name);
    assert.equal(new Set(names).size, names.length, 'doppelte Namen');
    assert.ok(GENERIC_FOODS.length >= 140 && FOOD_CLASSES.size >= 150);
    for (const [label, c] of FOOD_CLASSES) {
      assert.ok(isPlausiblePer100g(c.per100g), label);
      assert.ok(c.portions.small_g < c.portions.medium_g && c.portions.medium_g < c.portions.large_g, label);
    }
  });
});

describe('Auswertungen', () => {
  test('Streak', () => {
    const d = new Set(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-12']);
    assert.equal(computeStreak(d, '2026-10-16'), 3);
    assert.equal(computeStreak(d, '2026-10-17'), 3); // heute noch nichts → Serie zählt bis gestern
    assert.equal(computeStreak(d, '2026-10-18'), 0);
    assert.equal(computeStreak(new Set(), '2026-10-16'), 0);
  });

  const item = (kcal) => ({ name: `x${kcal}`, kcal, protein_g: 10, carbs_g: 20, fat_g: 5, per100g: { kcal, protein_g: 10, carbs_g: 20, fat_g: 5 }, grams: 100 });
  const meals = [
    { date: '2026-10-14', createdAt: '2026-10-14T08:00', items: [item(1900)] },
    { date: '2026-10-16', createdAt: '2026-10-16T08:00', items: [item(1000)] },
    { date: '2026-10-16', createdAt: '2026-10-16T12:00', items: [item(1500)] },
  ];

  test('Tagesreihe und Zusammenfassung', () => {
    const series = dailySeries(meals, '2026-10-14', '2026-10-16', () => ({ kcal: 2000 }));
    assert.deepEqual(series.map((d) => [d.date, d.logged, d.kcal]), [['2026-10-14', true, 1900], ['2026-10-15', false, 0], ['2026-10-16', true, 2500]]);
    assert.equal(isOnTarget(series[0]), true);
    assert.equal(isOnTarget(series[2]), false);
    const s = summarize(series);
    assert.equal(s.loggedDays, 2);
    assert.equal(s.avgKcal, 2200);
    assert.equal(s.onTargetDays, 1);
    assert.equal(summarize([]).loggedDays, 0);
  });

  test('Zuletzt gegessen: neueste zuerst, ohne Doppelte', () => {
    const r = recentItems([...meals, { date: '2026-10-16', createdAt: '2026-10-16T18:00', items: [item(1000)] }]);
    assert.deepEqual(r.map((i) => i.name), ['x1000', 'x1500', 'x1900']);
  });

  test('Gewichtsveränderung', () => {
    assert.equal(weightChange([{ kg: 80 }, { kg: 79.2 }, { kg: 78.4 }]), -1.6);
    assert.equal(weightChange([{ kg: 80 }]), null);
  });

  test('Suche findet mit Umlauten und Teilwörtern', () => {
    assert.equal(filterFoods(GENERIC_FOODS, 'banane')[0].name, 'Banane');
    assert.ok(filterFoods(GENERIC_FOODS, 'huhner').some((f) => f.name.startsWith('Hühnerbrust')));
    assert.ok(filterFoods(GENERIC_FOODS, 'Hühner').some((f) => f.name.startsWith('Hühnerbrust')));
    assert.ok(filterFoods(GENERIC_FOODS, 'huehner').some((f) => f.name.startsWith('Hühnerbrust')));
    assert.deepEqual(filterFoods(GENERIC_FOODS, '   '), []);
    assert.equal(filterFoods(DISH_FOODS, 'cinnamon roll')[0].name, 'Zimtschnecke');
    assert.equal(filterFoods(DISH_FOODS, 'zimtschnecke')[0].name, 'Zimtschnecke');
    assert.equal(filterFoods(GENERIC_FOODS, 'paradeiser')[0].name, 'Tomate');
    // Schnellwahl im Prüfen-Bildschirm verweist auf vorhandene Lebensmittel
    for (const n of ['Rindersteak, gebraten', 'Pommes frites', 'Reis, gekocht', 'Kartoffeln, gekocht', 'Nudeln, gekocht', 'Fisolen, gekocht', 'Gemüse, gemischt (gedünstet)', 'Blattsalat', 'Bratensoße', 'Semmel']) {
      assert.ok(GENERIC_FOODS.some((f) => f.name === n), n);
    }
  });
});

describe('Export', () => {
  test('CSV mit Semikolon, Komma und Escaping', () => {
    const csv = toCSV([['a', 1.5, 'x;y'], ['"q"', null, 2]]);
    assert.equal(csv, '﻿a;1,5;"x;y"\r\n"""q""";;2');
    const m = mealsToCSV([{ date: '2026-10-16', createdAt: 'x', mealType: 'lunch', source: 'photo', items: [{ name: 'Schnitzel', grams: 180, kcal: 423, protein_g: 30.6, carbs_g: 23.4, fat_g: 23.4 }] }]);
    assert.ok(m.includes('2026-10-16;Mittagessen;Schnitzel;180;423;30,6;23,4;23,4;photo'));
  });
  test('Kalender-Datei', () => {
    const ics = buildICS([{ title: 'Frühstück, eintragen', time: '8:05', rrule: 'FREQ=DAILY' }], new Date(2026, 9, 16));
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.includes('DTSTART:20261016T080500'));
    assert.ok(ics.includes('SUMMARY:Frühstück\\, eintragen'));
    assert.ok(ics.includes('BEGIN:VALARM'));
    assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  });
  test('Backup prüfen', () => {
    assert.match(validateBackup({}), /keine Backup-Datei/);
    const stores = Object.fromEntries(['settings', 'goals', 'meals', 'foods', 'recipes', 'favorites', 'weights', 'water'].map((k) => [k, []]));
    assert.equal(validateBackup({ format: 'kalorientracker-backup', version: 1, stores }), null);
    assert.match(validateBackup({ format: 'kalorientracker-backup', version: 99, stores }), /neueren/);
  });
});

describe('Open Food Facts', () => {
  test('Produkt umwandeln', () => {
    const f = productToFood({
      code: '9001234567890', product_name_de: 'Joghurt Natur', brands: 'Hofmarke, Andere',
      nutriments: { 'energy-kcal_100g': 61, proteins_100g: 3.5, carbohydrates_100g: 4.7, fat_100g: 3.3 }, serving_quantity: '150',
    });
    assert.equal(f.id, 'off:9001234567890');
    assert.equal(f.name, 'Joghurt Natur');
    assert.equal(f.brand, 'Hofmarke');
    assert.equal(f.servingG, 150);
    assert.deepEqual(f.per100g, { kcal: 61, protein_g: 3.5, carbs_g: 4.7, fat_g: 3.3 });
  });
  test('kJ werden umgerechnet, fehlende Werte ergeben null', () => {
    const f = productToFood({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4 } });
    assert.equal(f.per100g.kcal, 100);
    assert.equal(productToFood({ code: '2', product_name: 'Y', nutriments: {} }).per100g, null);
  });
});

describe('Diagramme', () => {
  test('Achsen und SVG', () => {
    assert.deepEqual(niceTicks(2400, 3), [1000, 2000]);
    const svg = barChart([{ label: 'Mo', value: 1800, goal: 2000, logged: true }, { label: 'Di', value: 0, goal: 2000, logged: false }]);
    assert.ok(svg.startsWith('<svg') && svg.includes('goal-line'));
    assert.equal(lineChart([{ x: 0, y: 80, label: 'a' }]), '');
    assert.ok(lineChart([{ x: 0, y: 80, label: 'a' }, { x: 6, y: 79.4, label: 'b' }]).includes('<path'));
  });
});
