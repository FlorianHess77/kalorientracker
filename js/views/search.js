/** Suche: lokale Lebensmittel sofort, Open Food Facts auf Knopfdruck. Dazu Favoriten, Zuletzt und Rezepte. */

import * as db from '../db.js';
import { navigate, goBack } from '../main.js';
import { addDays, todayISO } from '../lib/dates.js';
import { nutrientsForGrams } from '../lib/nutrition.js';
import { filterFoods, normalize, recentItems } from '../lib/stats.js';
import { GENERIC_FOODS } from '../data/generic-foods.js';
import { DISH_FOODS, FOOD_CLASSES } from '../data/food-classes.js';
import { estimateDish } from '../data/dish-estimates.js';
import { isUsableLabel } from '../recognition/postprocess.js';
import { OffError, searchProducts } from '../off.js';
import { ensureDraft, setPendingFood } from '../draft.js';
import { button, clear, fmt, h, header, icon, notice, toast } from '../ui.js';

const SOURCE_LABEL = { generic: 'Grundnahrungsmittel', custom: 'Eigenes', off: 'Open Food Facts', recent: 'Zuletzt', estimate: 'Schätzwert', dish: 'Gericht' };

export async function render(view, params) {
  const replace = params.replace || '';
  const [ownFoods, favorites, recipes, recentMeals] = await Promise.all([
    db.allFoods(), db.allFavorites(), db.allRecipes(), db.mealsInRange(addDays(todayISO(), -30), addDays(todayISO(), 1)),
  ]);
  // Eigene Lebensmittel zuerst; gleiche Namen nur einmal
  const seenNames = new Set();
  const pool = [...ownFoods.filter((f) => f.per100g), ...GENERIC_FOODS, ...DISH_FOODS].filter((f) => {
    const key = normalize(f.name);
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
  const recent = recentItems(recentMeals, 10);

  // Alle weiteren Gerichte des Foto-Modells mit Schätzwerten (Labelliste wird lokal geladen)
  try {
    const res = await fetch(new URL('../../models/aiy_food_V1_labels.json', import.meta.url));
    if (res.ok) {
      for (const label of await res.json()) {
        if (!isUsableLabel(label) || FOOD_CLASSES.has(label)) continue;
        const est = estimateDish(label);
        const key = normalize(label);
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        pool.push({ id: `estimate:${label}`, source: 'estimate', name: label, brand: null, barcode: null, per100g: est.per100g, servingG: est.portions.medium_g, portions: est.portions });
      }
    }
  } catch { /* ohne Labelliste nur die genauen Daten */ }

  let query = params.q || '';
  let remote = [];
  let remoteState = 'idle'; // idle | loading | done | error
  let remoteError = '';
  let controller = null;

  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const input = h('input', {
    type: 'search', value: query, placeholder: 'Lebensmittel oder Marke suchen', enterkeyhint: 'search', autocomplete: 'off',
    'aria-label': 'Suchbegriff',
    oninput: (e) => { query = e.target.value; remote = []; remoteState = 'idle'; draw(); },
  });
  const form = h('form', { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); input.blur(); searchRemote(); } },
    icon('search', 20), input);

  const suffix = replace ? `?replace=${replace}` : '';
  const pick = (food, grams) => {
    setPendingFood(food);
    navigate(`food${suffix}${grams ? `${suffix ? '&' : '?'}grams=${grams}` : ''}`);
  };

  async function searchRemote() {
    if (query.trim().length < 2) { toast('Bitte mindestens 2 Zeichen eingeben.'); return; }
    controller?.abort();
    controller = new AbortController();
    remoteState = 'loading';
    draw();
    try {
      const found = await searchProducts(query, { signal: controller.signal });
      const localIds = new Set(pool.map((f) => f.id));
      remote = found.filter((f) => !localIds.has(f.id));
      remoteState = 'done';
    } catch (e) {
      if (e.name === 'AbortError') return;
      remoteState = 'error';
      remoteError = e instanceof OffError ? e.message : 'Die Suche hat nicht geklappt.';
    }
    draw();
  }

  function addRecipe(recipe) {
    const d = ensureDraft({ date: todayISO(), mealType: 'snack', source: 'recipe' });
    for (const it of recipe.items) d.items.push({ ...it, id: db.uid() });
    if (d.source !== 'photo') d.source = 'recipe';
    toast(`„${recipe.name}“ hinzugefügt`, 'success');
    navigate('review');
  }

  function draw() {
    clear(results);
    const q = query.trim();
    if (!q) {
      const favFoods = favorites.filter((f) => f.kind === 'food').map((f) => f.food);
      if (favFoods.length) results.append(section('Favoriten', favFoods.map((f) => foodRow(f, () => pick(f, f.servingG)))));
      if (recent.length) {
        results.append(section('Zuletzt gegessen', recent.map((it) => {
          const food = { id: it.foodRef ?? `recent:${it.name}`, source: 'recent', name: it.name, brand: null, per100g: it.per100g, servingG: it.servingG ?? it.grams, portions: it.portions };
          return foodRow(food, () => pick(food, it.grams), it.grams);
        })));
      }
      if (recipes.length && !replace) {
        results.append(section('Meine Rezepte', recipes.map((r) => {
          const kcal = r.items.reduce((s, i) => s + i.kcal, 0);
          return h('li', null, h('button', { type: 'button', class: 'list-row', onclick: () => addRecipe(r) },
            h('span', { class: 'list-text' }, h('span', null, r.name), h('span', { class: 'muted small' }, `${r.items.length} Zutaten`)),
            h('span', { class: 'list-kcal' }, `${fmt(kcal)} kcal`), icon('plus', 18)));
        })));
      }
      if (!favFoods.length && !recent.length) results.append(h('p', { class: 'muted center' }, 'Tippe einen Suchbegriff ein, z. B. „Banane“ oder „Joghurt“.'));
      return;
    }

    const local = filterFoods(pool, q, 25);
    const matchingRecipes = replace ? [] : recipes.filter((r) => normalize(r.name).includes(normalize(q)));
    if (matchingRecipes.length) {
      results.append(section('Meine Rezepte', matchingRecipes.map((r) =>
        h('li', null, h('button', { type: 'button', class: 'list-row', onclick: () => addRecipe(r) },
          h('span', { class: 'list-text' }, h('span', null, r.name), h('span', { class: 'muted small' }, 'Rezept')), icon('plus', 18))))));
    }
    if (local.length) results.append(section('Auf diesem Gerät', local.map((f) => foodRow(f, () => pick(f, f.servingG)))));

    if (remoteState === 'idle') {
      results.append(h('div', { class: 'center stack' },
        !local.length ? h('p', { class: 'muted' }, 'Lokal nichts gefunden.') : null,
        button('In Open Food Facts suchen', searchRemote, { variant: 'secondary', iconName: 'search' })));
    } else if (remoteState === 'loading') {
      results.append(h('div', { class: 'center stack' }, h('div', { class: 'spinner' }), h('p', { class: 'muted small' }, 'Suche in Open Food Facts …')));
    } else if (remoteState === 'error') {
      results.append(notice(remoteError, 'error'));
    } else if (remote.length) {
      results.append(section('Open Food Facts', remote.map((f) => foodRow(f, () => pick(f, f.servingG)))));
    } else {
      results.append(h('p', { class: 'muted center' }, 'Auch in Open Food Facts nichts mit Nährwerten gefunden.'));
    }

    results.append(h('div', { class: 'center stack' },
      button('Selbst eintragen', () => navigate(`manual?name=${encodeURIComponent(q)}${replace ? `&replace=${replace}` : ''}`), { variant: 'ghost', iconName: 'edit' })));
  }

  view.append(header('Lebensmittel suchen', { back: () => goBack() }), form, results);
  draw();
  setTimeout(() => input.focus(), 50);
  if (params.q && params.auto) searchRemote();

  return () => controller?.abort();
}

function section(title, rows) {
  return h('section', null, h('h2', { class: 'section-title' }, title), h('ul', { class: 'list card' }, rows));
}

function foodRow(food, onClick, grams) {
  const g = grams ?? food.servingG ?? 100;
  const kcal = nutrientsForGrams(food.per100g, g).kcal;
  return h('li', null, h('button', { type: 'button', class: 'list-row', onclick: onClick },
    h('span', { class: 'list-text' },
      h('span', null, food.name),
      h('span', { class: 'muted small' }, [food.brand, SOURCE_LABEL[food.source], `${fmt(food.per100g.kcal)} kcal/100 g`].filter(Boolean).join(' · '))),
    h('span', { class: 'list-kcal' }, `${fmt(kcal)} kcal`, h('small', null, `${fmt(g)} g`)),
    icon('right', 18)));
}
