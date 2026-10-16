/** Erfassen: Foto, Galerie, Barcode, Suche, Manuell, Vom Vortag kopieren, Zuletzt & Favoriten. */

import * as db from '../db.js';
import { app, navigate } from '../main.js';
import { MEAL_TYPES, addDays, formatDayLabel, isValidISODate, mealLabel, mealTypeForTime, todayISO } from '../lib/dates.js';
import { nutrientsForGrams } from '../lib/nutrition.js';
import { recentItems } from '../lib/stats.js';
import { recognizerStatus, warmUp } from '../recognition/recognizer.js';
import { analyzePhoto } from '../photo-flow.js';
import { clearDraft, getDraft, setCaptureContext, setPendingFood } from '../draft.js';
import { confirmDialog, fmt, h, header, icon, pickFile, segmented, toast } from '../ui.js';

export async function render(view, params) {
  const date = isValidISODate(params.date) ? params.date : app.viewDate ?? todayISO();
  let mealType = MEAL_TYPES.some((m) => m.value === params.meal) ? params.meal : mealTypeForTime();
  const ctx = () => ({ date, mealType });
  setCaptureContext(ctx());
  // Neuer Erfassungsvorgang: alten, nicht gespeicherten Entwurf verwerfen (außer beim Bearbeiten)
  if (getDraft() && !getDraft().editingMealId) clearDraft();

  // Modell im Hintergrund laden, damit das Foto gleich ausgewertet werden kann
  warmUp().catch(() => {});

  const [recentMeals, favorites] = await Promise.all([db.mealsInRange(addDays(date, -30), addDays(date, 1)), db.allFavorites()]);
  const recent = recentItems(recentMeals, 8);

  const statusLine = h('p', { class: 'muted small center', 'aria-live': 'polite' });
  const updateStatus = () => {
    const s = recognizerStatus();
    statusLine.textContent = s === 'loading' ? 'Foto-Erkennung wird vorbereitet …'
      : s === 'failed' ? 'Foto-Erkennung gerade nicht verfügbar – Barcode und Suche funktionieren.'
        : s === 'ready' ? 'Foto-Erkennung bereit (läuft offline auf deinem Gerät)' : '';
  };
  updateStatus();
  const timer = setInterval(updateStatus, 700);

  async function fromGallery() {
    const file = await pickFile({ accept: 'image/*' });
    if (file) await analyzePhoto(file, ctx());
  }

  async function copyYesterday() {
    const from = addDays(date, -1);
    const source = (await db.mealsForDate(from)).filter((m) => m.mealType === mealType);
    if (!source.length) {
      toast(`Am Vortag gibt es kein ${mealLabel(mealType)}.`);
      return;
    }
    const ok = await confirmDialog({
      title: 'Vom Vortag kopieren?',
      text: `${source.length === 1 ? 'Eine Mahlzeit' : `${source.length} Mahlzeiten`} (${mealLabel(mealType)}) von ${formatDayLabel(from)} übernehmen.`,
      confirmLabel: 'Kopieren',
    });
    if (!ok) return;
    for (const m of source) {
      await db.saveMeal({ ...m, id: db.uid(), date, source: 'copy', createdAt: new Date().toISOString(), items: m.items.map((i) => ({ ...i, id: db.uid() })) });
    }
    toast('Kopiert', 'success');
    navigate(`today?date=${date}`, { replace: true });
  }

  const openFood = (food, grams) => {
    setPendingFood(food);
    navigate(`food${grams ? `?grams=${grams}` : ''}`);
  };

  const mealSwitch = segmented(
    MEAL_TYPES.map((m) => ({ value: m.value, label: m.label.replace('essen', '').replace('Snacks', 'Snack') })),
    mealType,
    (v) => { mealType = v; setCaptureContext(ctx()); navigate(`capture?date=${date}&meal=${v}`, { replace: true }); },
  );

  view.append(
    header(`Erfassen · ${formatDayLabel(date)}`, { back: () => navigate(`today?date=${date}`) }),
    mealSwitch,
    h('div', { class: 'capture-main' },
      h('button', { type: 'button', class: 'capture-big', onclick: () => navigate(`camera?date=${date}&meal=${mealType}`) },
        icon('camera', 40), h('strong', null, 'Foto aufnehmen'), h('span', null, 'Gericht fotografieren')),
      h('button', { type: 'button', class: 'capture-secondary', onclick: fromGallery },
        icon('image', 22), h('span', null, 'Aus Galerie wählen'))),
    statusLine,
    h('div', { class: 'tile-grid' },
      tile('barcode', 'Barcode', () => navigate('barcode')),
      tile('search', 'Suchen', () => navigate('search')),
      tile('edit', 'Manuell', () => navigate('manual')),
      tile('copy', 'Vom Vortag', copyYesterday)),
  );

  if (favorites.length) {
    view.append(h('h2', { class: 'section-title' }, 'Favoriten'),
      h('ul', { class: 'list card' }, favorites.filter((f) => f.kind === 'food').slice(0, 10).map((f) =>
        listRow(f.food.name, f.food.brand, f.food.per100g, f.food.servingG ?? 100, () => openFood(f.food, f.food.servingG)))));
  }
  if (recent.length) {
    view.append(h('h2', { class: 'section-title' }, 'Zuletzt gegessen'),
      h('ul', { class: 'list card' }, recent.map((it) =>
        listRow(it.name, null, it.per100g, it.grams, () =>
          openFood({ id: it.foodRef ?? `recent:${it.name}`, source: 'recent', name: it.name, brand: null, per100g: it.per100g, servingG: it.servingG ?? it.grams, portions: it.portions }, it.grams)))));
  }

  return () => clearInterval(timer);
}

function tile(iconName, label, onClick) {
  return h('button', { type: 'button', class: 'tile', onclick: onClick }, icon(iconName, 26), h('span', null, label));
}

function listRow(name, brand, per100g, grams, onClick) {
  const kcal = per100g ? nutrientsForGrams(per100g, grams).kcal : null;
  return h('li', null, h('button', { type: 'button', class: 'list-row', onclick: onClick },
    h('span', { class: 'list-text' }, h('span', null, name), h('span', { class: 'muted small' }, [brand, `${fmt(grams)} g`].filter(Boolean).join(' · '))),
    kcal !== null ? h('span', { class: 'list-kcal' }, `${fmt(kcal)} kcal`) : null,
    icon('plus', 18)));
}
