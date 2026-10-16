/** Auswertungen für Dashboard und Fortschritt – reine Funktionen, getestet. */

import { addDays, daysBetween } from './dates.js';
import { dayTotals, macroSplit } from './nutrition.js';

/** Zusammenhängende Tage mit Einträgen, endend heute (oder gestern, wenn heute noch nichts eingetragen ist) */
export function computeStreak(dateSet, today) {
  let day = dateSet.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dateSet.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/**
 * Tageswerte für einen Zeitraum.
 * @param meals alle Mahlzeiten im Zeitraum
 * @param goalForDay (date) => Ziel-Objekt oder null
 */
export function dailySeries(meals, start, end, goalForDay) {
  const byDate = new Map();
  for (const m of meals) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  }
  return daysBetween(start, end).map((date) => {
    const dayMeals = byDate.get(date) || [];
    const totals = dayTotals(dayMeals);
    const goal = goalForDay(date);
    return { date, logged: dayMeals.length > 0, ...totals, goalKcal: goal?.kcal ?? null };
  });
}

/** "Im Ziel" = innerhalb ±10 % des Kalorienziels */
export function isOnTarget(day, tolerance = 0.1) {
  if (!day.logged || !day.goalKcal) return false;
  return Math.abs(day.kcal - day.goalKcal) <= day.goalKcal * tolerance;
}

export function summarize(series) {
  const logged = series.filter((d) => d.logged);
  const n = logged.length;
  if (!n) {
    return { loggedDays: 0, avgKcal: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, onTargetDays: 0, split: macroSplit({ protein_g: 0, carbs_g: 0, fat_g: 0 }) };
  }
  const avg = (key) => logged.reduce((s, d) => s + d[key], 0) / n;
  const avgProtein = Math.round(avg('protein_g'));
  const avgCarbs = Math.round(avg('carbs_g'));
  const avgFat = Math.round(avg('fat_g'));
  return {
    loggedDays: n,
    avgKcal: Math.round(avg('kcal')),
    avgProtein,
    avgCarbs,
    avgFat,
    onTargetDays: logged.filter((d) => isOnTarget(d)).length,
    split: macroSplit({ protein_g: avgProtein, carbs_g: avgCarbs, fat_g: avgFat }),
  };
}

/** Gewichtsveränderung im Zeitraum (letzter minus erster Eintrag) */
export function weightChange(weights) {
  if (weights.length < 2) return null;
  return Math.round((weights[weights.length - 1].kg - weights[0].kg) * 10) / 10;
}

/** Zuletzt gegessene Lebensmittel, einmalig pro Name, neueste zuerst */
export function recentItems(meals, limit = 15) {
  const sorted = [...meals].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const seen = new Set();
  const out = [];
  for (const m of sorted) {
    for (const it of m.items || []) {
      const key = it.name.toLowerCase();
      if (seen.has(key) || !it.per100g) continue;
      seen.add(key);
      out.push(it);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Einfache Text-Suche über lokale Lebensmittel (alle Wörter müssen vorkommen) */
export function filterFoods(foods, query, limit = 30) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const f of foods) {
    const hay = normalize(`${f.name} ${f.brand ?? ''} ${f.aliases ?? ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const name = normalize(f.name);
    const score = (name.startsWith(words[0]) ? 0 : 1) + (f.source === 'generic' ? 0 : 0.5) + name.length / 1000;
    scored.push({ f, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.f);
}

/** Kleinbuchstaben, ohne Akzente; "ü", "ue" und "u" gelten als gleich (Hühner = Huehner = Huhner) */
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/ß/g, 'ss');
}
