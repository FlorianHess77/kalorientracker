/** Startseite: verbleibende Kalorien, Makros, Wasser, Streak und die Mahlzeiten des Tages. */

import * as db from '../db.js';
import { app, goalForDate, navigate } from '../main.js';
import { MEAL_TYPES, addDays, formatDayLabel, isValidISODate, todayISO } from '../lib/dates.js';
import { blobUrl } from '../lib/image.js';
import { dayTotals, mealTotals } from '../lib/nutrition.js';
import { computeStreak } from '../lib/stats.js';
import { bar, fmt, h, icon, iconButton, ring } from '../ui.js';

export async function render(view, params) {
  const today = todayISO();
  const date = isValidISODate(params.date) ? params.date : today;
  app.viewDate = date;

  const [meals, water, dates] = await Promise.all([db.mealsForDate(date), db.waterFor(date), db.datesWithMeals()]);
  const goal = goalForDate(date) ?? { kcal: 2000, protein_g: 100, carbs_g: 250, fat_g: 65, water_ml: 2000 };
  const totals = dayTotals(meals);
  const remaining = goal.kcal - totals.kcal;
  const streak = computeStreak(dates, today);

  const goTo = (d) => navigate(`today?date=${d}`, { replace: true });

  // ───────────── Kopf: Datum & Streak ─────────────
  const datePicker = h('input', {
    type: 'date', class: 'visually-hidden-input', value: date, max: addDays(today, 30), 'aria-label': 'Datum wählen',
    onchange: (e) => { if (isValidISODate(e.target.value)) goTo(e.target.value); },
  });
  view.append(
    h('header', { class: 'day-header' },
      iconButton('left', () => goTo(addDays(date, -1)), 'Vorheriger Tag'),
      h('button', {
        type: 'button', class: 'day-label',
        onclick: () => { try { datePicker.showPicker(); } catch { datePicker.focus(); datePicker.click(); } },
      }, formatDayLabel(date, today), datePicker),
      iconButton('right', () => goTo(addDays(date, 1)), 'Nächster Tag'),
      h('span', { class: ['streak', streak > 0 && 'on'], title: `${streak} Tage in Folge` }, icon('flame', 18), String(streak)),
    ),
  );
  if (date !== today) view.append(h('button', { type: 'button', class: 'link-btn center', onclick: () => goTo(today) }, 'Zurück zu heute'));

  // ───────────── Kalorien-Ring ─────────────
  const over = remaining < 0;
  view.append(
    h('section', { class: 'card summary' },
      ring({
        value: totals.kcal, max: goal.kcal, size: 196, stroke: 16,
        center: h('div', { class: 'ring-text' },
          h('strong', null, fmt(Math.abs(remaining))),
          h('span', null, over ? 'kcal zu viel' : 'kcal übrig')),
      }),
      h('div', { class: 'summary-stats' },
        stat('Ziel', fmt(goal.kcal)),
        stat('Gegessen', fmt(totals.kcal)),
        stat('Übrig', fmt(remaining))),
      h('div', { class: 'macros' },
        macro('Eiweiß', totals.protein_g, goal.protein_g, 'var(--protein)'),
        macro('Kohlenh.', totals.carbs_g, goal.carbs_g, 'var(--carbs)'),
        macro('Fett', totals.fat_g, goal.fat_g, 'var(--fat)')),
    ),
  );

  // ───────────── Wasser ─────────────
  const waterGoal = goal.water_ml || 2000;
  const liters = (ml) => String(Math.round(ml / 50) / 20).replace('.', ',');
  const changeWater = async (delta) => {
    await db.addWater(date, delta);
    navigate(`today?date=${date}&keepScroll=1`, { replace: true });
  };
  view.append(
    h('section', { class: 'card water' },
      h('div', { class: 'card-row' },
        h('span', { class: 'card-title' }, icon('drop', 20), 'Wasser'),
        h('span', { class: 'muted' }, `${liters(water)} / ${liters(waterGoal)} l`)),
      bar(water, waterGoal, 'var(--water)'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'chip', onclick: () => changeWater(-250), disabled: water <= 0, 'aria-label': '250 ml entfernen' }, '− 250 ml'),
        h('button', { type: 'button', class: 'chip', onclick: () => changeWater(250) }, '+ 250 ml'),
        h('button', { type: 'button', class: 'chip', onclick: () => changeWater(500) }, '+ 500 ml'))),
  );

  // ───────────── Mahlzeiten ─────────────
  for (const type of MEAL_TYPES) {
    const ofType = meals.filter((m) => m.mealType === type.value);
    const kcal = ofType.reduce((sum, m) => sum + mealTotals(m).kcal, 0);
    view.append(
      h('section', { class: 'card meal-section' },
        h('div', { class: 'card-row' },
          h('span', { class: 'card-title' }, type.label),
          h('span', { class: 'meal-kcal' }, ofType.length ? `${fmt(kcal)} kcal` : ''),
          iconButton('plus', () => navigate(`capture?date=${date}&meal=${type.value}`), `${type.label} hinzufügen`, 'icon-btn-accent')),
        ofType.length
          ? h('ul', { class: 'meal-list' }, ofType.map((m) => mealRow(m)))
          : h('p', { class: 'muted small' }, 'Noch nichts eingetragen.'),
      ),
    );
  }

  if (!meals.length && date === today) {
    view.append(h('p', { class: 'muted center small hint' }, 'Tipp: Tippe unten auf die Kamera, um dein Essen zu fotografieren.'));
  }

  // ───────────── Wischen zum Tageswechsel ─────────────
  let startX = 0;
  let startY = 0;
  const onStart = (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
  const onEnd = (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) goTo(addDays(date, dx < 0 ? 1 : -1));
  };
  view.addEventListener('touchstart', onStart, { passive: true });
  view.addEventListener('touchend', onEnd, { passive: true });

  return () => {
    view.removeEventListener('touchstart', onStart);
    view.removeEventListener('touchend', onEnd);
  };
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('strong', null, value), h('span', null, label));
}

function macro(label, value, goal, color) {
  return h('div', { class: 'macro' },
    h('div', { class: 'macro-head' }, h('span', null, label), h('span', { class: 'muted' }, `${fmt(value)}/${fmt(goal)} g`)),
    bar(value, goal, color));
}

function mealRow(meal) {
  const t = mealTotals(meal);
  const names = meal.items.map((i) => i.name).join(', ');
  return h('li', null,
    h('button', { type: 'button', class: 'meal-row', onclick: () => navigate(`meal?id=${meal.id}`) },
      meal.photo ? h('img', { class: 'thumb', src: blobUrl(meal.photo), alt: '' })
        : h('span', { class: 'thumb thumb-icon' }, icon(meal.source === 'barcode' ? 'barcode' : meal.source === 'photo' ? 'camera' : 'book', 20)),
      h('span', { class: 'meal-row-text' }, h('span', { class: 'meal-names' }, names || 'Leere Mahlzeit'),
        h('span', { class: 'muted small' }, `${fmt(t.protein_g)} g E · ${fmt(t.carbs_g)} g KH · ${fmt(t.fat_g)} g F`)),
      h('strong', { class: 'meal-row-kcal' }, `${fmt(t.kcal)}`)));
}
