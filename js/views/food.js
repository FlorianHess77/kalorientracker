/** Portion wählen und zur Mahlzeit hinzufügen. */

import * as db from '../db.js';
import { navigate, goBack } from '../main.js';
import { parseDecimal, todayISO } from '../lib/dates.js';
import { nutrientsForGrams } from '../lib/nutrition.js';
import { ensureDraft, getPendingFood, itemFromFood, replaceItem } from '../draft.js';
import { button, confirmDialog, fmt, h, header, icon, toast } from '../ui.js';

const SOURCE_TEXT = {
  generic: 'Grundnahrungsmittel (Richtwerte)',
  custom: 'Eigenes Lebensmittel',
  off: 'Open Food Facts',
  recent: 'Zuletzt gegessen',
  estimate: 'Grober Schätzwert nach Gerichtstyp',
  dish: 'Gericht – Richtwerte für eine typische Zubereitung',
};

export async function render(view, params) {
  const food = getPendingFood();
  if (!food?.per100g) {
    navigate('search', { replace: true });
    return;
  }
  let grams = Math.round(parseDecimal(params.grams) || food.servingG || 100);
  const favKey = db.favoriteKeyForFood(food);
  let fav = await db.isFavorite(favKey);

  const kcalEl = h('div', { class: 'big-number' });
  const macroEls = { protein_g: h('strong'), carbs_g: h('strong'), fat_g: h('strong') };
  const update = () => {
    const n = nutrientsForGrams(food.per100g, grams);
    kcalEl.replaceChildren(fmt(n.kcal), h('span', null, ' kcal'));
    for (const k of Object.keys(macroEls)) macroEls[k].textContent = `${fmt(n[k], 1)} g`;
  };

  const input = h('input', {
    type: 'text', inputmode: 'decimal', value: String(grams), 'aria-label': 'Menge in Gramm',
    oninput: (e) => { const v = parseDecimal(e.target.value); if (v > 0 && v <= 5000) { grams = Math.round(v); update(); } },
  });

  const favBtn = h('button', {
    type: 'button', class: ['icon-btn', fav && 'fav-on'], 'aria-pressed': fav ? 'true' : 'false', 'aria-label': 'Favorit',
    onclick: async () => {
      fav = await db.toggleFavoriteFood(food);
      favBtn.classList.toggle('fav-on', fav);
      favBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
      toast(fav ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
    },
  }, icon('star'));

  const quick = [...new Set([food.servingG, 50, 100, 150, 200, 250].filter((g) => g > 0).map((g) => Math.round(g)))].slice(0, 6);

  async function add() {
    if (!(grams > 0)) { toast('Bitte eine Menge angeben.', 'error'); return; }
    // Produkte aus Open Food Facts lokal merken (offline verfügbar, schont das Abfrage-Limit)
    if (food.source === 'off') await db.saveFood(food).catch(() => {});
    const d = ensureDraft({ date: todayISO(), mealType: 'snack', source: 'search' });
    const item = itemFromFood(food, grams);
    if (params.replace) replaceItem(params.replace, item);
    else d.items.push(item);
    if (!d.source || d.source === 'manual') d.source = 'search';
    navigate('review');
  }

  async function removeCustom() {
    const ok = await confirmDialog({ title: 'Lebensmittel löschen?', text: `„${food.name}“ wird aus deinen eigenen Lebensmitteln entfernt. Bereits eingetragene Mahlzeiten bleiben erhalten.`, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await db.deleteFood(food.id);
    toast('Gelöscht');
    goBack('search');
  }

  view.append(
    header(food.name, { back: () => goBack('search'), right: favBtn }),
    h('p', { class: 'muted center small' }, [food.brand, SOURCE_TEXT[food.source] ?? ''].filter(Boolean).join(' · ')),
    h('section', { class: 'card center' },
      kcalEl,
      h('div', { class: 'macro-grid' },
        h('div', { class: 'macro-box' }, h('span', { class: 'dot', style: { background: 'var(--protein)' } }), macroEls.protein_g, h('span', null, 'Eiweiß')),
        h('div', { class: 'macro-box' }, h('span', { class: 'dot', style: { background: 'var(--carbs)' } }), macroEls.carbs_g, h('span', null, 'Kohlenh.')),
        h('div', { class: 'macro-box' }, h('span', { class: 'dot', style: { background: 'var(--fat)' } }), macroEls.fat_g, h('span', null, 'Fett')))),
    h('section', { class: 'card' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Menge'),
        h('div', { class: 'input-group' }, input, h('span', { class: 'input-suffix' }, 'g'))),
      h('div', { class: 'chips wrap' }, quick.map((g) =>
        h('button', { type: 'button', class: 'chip', onclick: () => { grams = g; input.value = String(g); update(); } },
          g === food.servingG ? `1 Portion · ${g} g` : `${g} g`)))),
    h('section', { class: 'card' },
      h('h2', null, 'Pro 100 g'),
      h('dl', { class: 'facts' },
        h('dt', null, 'Energie'), h('dd', null, `${fmt(food.per100g.kcal)} kcal`),
        h('dt', null, 'Eiweiß'), h('dd', null, `${fmt(food.per100g.protein_g, 1)} g`),
        h('dt', null, 'Kohlenhydrate'), h('dd', null, `${fmt(food.per100g.carbs_g, 1)} g`),
        h('dt', null, 'Fett'), h('dd', null, `${fmt(food.per100g.fat_g, 1)} g`)),
      food.source === 'off' ? h('p', { class: 'muted small' }, 'Daten: Open Food Facts (ODbL). Angaben können unvollständig sein.') : null),
    food.source === 'custom' ? h('div', { class: 'center' }, button('Eigenes Lebensmittel löschen', removeCustom, { variant: 'ghost', iconName: 'trash', small: true })) : null,
    h('div', { class: 'sticky-actions' }, button(params.replace ? 'Übernehmen' : 'Hinzufügen', add, { block: true, iconName: 'plus' })),
  );
  update();
}
