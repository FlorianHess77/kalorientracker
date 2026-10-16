/** Prüfen & Speichern: Einträge bearbeiten, Portion anpassen, Rückfrage bei unsicherer Erkennung. */

import * as db from '../db.js';
import { app, navigate } from '../main.js';
import { MEAL_TYPES, formatDayLabel, parseDecimal } from '../lib/dates.js';
import { blobUrl } from '../lib/image.js';
import { sumNutrients, withGrams } from '../lib/nutrition.js';
import { clearDraft, getDraft } from '../draft.js';
import { draftItemFromCandidate } from './capture.js';
import { button, clear, confirmDialog, fmt, h, header, iconButton, notice, promptDialog, segmented, toast } from '../ui.js';

const MAX_GRAMS = 3000;

export async function render(view) {
  const d = getDraft();
  if (!d) {
    navigate('today', { replace: true });
    return;
  }
  const editing = Boolean(d.editingMealId);

  function draw() {
    clear(view);
    const totals = sumNutrients(d.items);
    const missing = d.items.some((i) => i.needsNutrition);

    view.append(
      header(editing ? 'Mahlzeit bearbeiten' : 'Prüfen & speichern', {
        back: async () => {
          if (!editing && d.items.length && !(await confirmDialog({ title: 'Verwerfen?', text: 'Die Einträge wurden noch nicht gespeichert.', confirmLabel: 'Verwerfen', danger: true }))) return;
          clearDraft();
          navigate(`today?date=${d.date}`);
        },
      }),
      h('p', { class: 'muted center small' }, formatDayLabel(d.date)),
      segmented(MEAL_TYPES.map((m) => ({ value: m.value, label: m.label.replace('essen', '').replace('Snacks', 'Snack') })), d.mealType, (v) => { d.mealType = v; draw(); }),
    );

    if (d.preview) view.append(h('img', { class: 'review-photo', src: blobUrl(d.preview), alt: 'Dein Foto' }));

    if (d.noFood && !d.items.length) {
      view.append(notice('Das Foto war nicht eindeutig. Tippe unten an, was auf dem Teller ist, oder such es direkt. Einzelzutaten wie Obst bitte über die Suche eintragen.', 'info'));
    }

    if (d.question?.length) {
      const has = (label) => d.items.some((i) => i.label === label);
      view.append(
        h('section', { class: 'card question' },
          h('h2', null, 'Was ist auf deinem Teller?'),
          h('p', { class: 'muted small' }, 'Mehrere möglich – antippen zum Hinzufügen oder Entfernen.'),
          h('div', { class: 'chips wrap' },
            d.question.map((c) => h('button', {
              type: 'button', class: ['chip', has(c.label) && 'active'], 'aria-pressed': has(c.label) ? 'true' : 'false',
              onclick: () => {
                if (has(c.label)) d.items = d.items.filter((i) => i.label !== c.label);
                else d.items.push(draftItemFromCandidate(c));
                d.noFood = false;
                draw();
              },
            }, `${c.name} · ${Math.max(1, Math.round(c.confidence * 100))} %`)),
            h('button', { type: 'button', class: 'chip', onclick: () => navigate('search') }, '+ Etwas anderes …'))),
      );
    }

    if (d.items.length) {
      view.append(h('div', { class: 'items' }, d.items.map((item) => itemCard(item))));
    }

    view.append(
      h('div', { class: 'row add-row' },
        button('Lebensmittel hinzufügen', () => navigate('search'), { variant: 'secondary', iconName: 'plus' }),
        button('Barcode', () => navigate('barcode'), { variant: 'ghost', iconName: 'barcode' })),
    );

    if (d.items.length) {
      view.append(
        h('section', { class: 'card totals' },
          h('div', { class: 'card-row' }, h('span', { class: 'card-title' }, 'Gesamt'), h('strong', { class: 'total-kcal' }, `${fmt(totals.kcal)} kcal`)),
          h('p', { class: 'muted small' }, `${fmt(totals.protein_g)} g Eiweiß · ${fmt(totals.carbs_g)} g Kohlenhydrate · ${fmt(totals.fat_g)} g Fett`)),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notiz (optional)'),
          h('input', { type: 'text', value: d.note, maxlength: '200', placeholder: 'z. B. im Restaurant', oninput: (e) => { d.note = e.target.value; } })),
      );
    }

    if (d.recognition) {
      view.append(h('p', { class: 'muted small center' }, 'Alle Werte sind Schätzungen. Prüfe die Portion – sie hat den größten Einfluss.'));
    }

    view.append(
      h('div', { class: 'sticky-actions' },
        editing ? button('', deleteMeal, { variant: 'danger', iconName: 'trash', ariaLabel: 'Mahlzeit löschen' }) : null,
        d.items.length > 1 ? button('Als Rezept', saveRecipe, { variant: 'secondary', iconName: 'book' }) : null,
        button(editing ? 'Änderungen speichern' : 'Speichern', save, { block: true, disabled: !d.items.length || missing })),
    );
    if (missing) view.querySelector('.sticky-actions').before(notice('Für mindestens einen Eintrag fehlen Nährwerte. Bitte das passende Lebensmittel suchen oder den Eintrag entfernen.', 'warning'));
  }

  function itemCard(item) {
    const nutritionText = h('p', { class: 'item-nutrition' });
    const kcalText = h('strong', { class: 'item-kcal' });
    const updateTexts = () => {
      kcalText.textContent = item.needsNutrition ? '? kcal' : `${fmt(item.kcal)} kcal`;
      nutritionText.textContent = item.needsNutrition ? 'Nährwerte unbekannt' : `${fmt(item.protein_g)} g E · ${fmt(item.carbs_g)} g KH · ${fmt(item.fat_g)} g F`;
    };

    const setGrams = (g, source) => {
      const grams = Math.max(1, Math.min(MAX_GRAMS, Math.round(g)));
      if (!Number.isFinite(grams)) return;
      Object.assign(item, withGrams(item, grams));
      if (source !== 'input') gramsInput.value = String(grams);
      if (source !== 'slider') slider.value = String(grams);
      updateTexts();
      updateTotals();
    };

    const sliderMax = Math.max(500, Math.round((item.portions?.large_g ?? item.servingG ?? 200) * 2.5 / 50) * 50);
    const gramsInput = h('input', {
      type: 'text', inputmode: 'numeric', value: String(item.grams ?? ''), 'aria-label': `Menge ${item.name} in Gramm`,
      oninput: (e) => { const v = parseDecimal(e.target.value); if (v > 0) setGrams(v, 'input'); },
    });
    const slider = h('input', {
      type: 'range', min: '5', max: String(sliderMax), step: '5', value: String(Math.min(item.grams ?? 100, sliderMax)), 'aria-label': 'Menge anpassen',
      oninput: (e) => setGrams(Number(e.target.value), 'slider'),
    });

    const presets = item.portions
      ? [['Klein', item.portions.small_g], ['Mittel', item.portions.medium_g], ['Groß', item.portions.large_g]]
      : item.servingG ? [['1 Portion', item.servingG], ['2 Portionen', item.servingG * 2]] : [['100 g', 100], ['200 g', 200]];

    updateTexts();
    return h('section', { class: 'card item-card' },
      h('div', { class: 'card-row' },
        h('span', { class: 'item-name' }, item.name,
          item.confidence !== null && item.confidence !== undefined ? h('span', { class: 'badge' }, `${Math.round(item.confidence * 100)} % sicher`) : null),
        iconButton('trash', () => { d.items = d.items.filter((x) => x !== item); draw(); }, `${item.name} entfernen`)),
      item.needsNutrition
        ? h('div', null,
          notice(`Für „${item.name}“ sind noch keine Nährwerte hinterlegt.`, 'info'),
          button('Passendes Lebensmittel suchen', () => navigate(`search?q=${encodeURIComponent(item.name)}&replace=${item.id}`), { variant: 'secondary', iconName: 'search', small: true }))
        : h('div', null,
          h('div', { class: 'grams-row' }, h('div', { class: 'input-group grams' }, gramsInput, h('span', { class: 'input-suffix' }, 'g')), kcalText),
          slider,
          h('div', { class: 'chips' }, presets.map(([label, g]) => h('button', { type: 'button', class: 'chip', onclick: () => setGrams(g, 'preset') }, `${label} · ${g} g`))),
          nutritionText),
    );
  }

  function updateTotals() {
    const totals = sumNutrients(d.items);
    const el = view.querySelector('.total-kcal');
    if (el) el.textContent = `${fmt(totals.kcal)} kcal`;
    const p = view.querySelector('.totals p');
    if (p) p.textContent = `${fmt(totals.protein_g)} g Eiweiß · ${fmt(totals.carbs_g)} g Kohlenhydrate · ${fmt(totals.fat_g)} g Fett`;
  }

  const cleanItems = () => d.items.map(({ needsNutrition, ...rest }) => rest);

  async function save() {
    if (!d.items.length || d.items.some((i) => i.needsNutrition)) return;
    if (d.items.some((i) => !(i.grams > 0))) { toast('Bitte bei jedem Eintrag eine Menge angeben.', 'error'); return; }
    const existing = editing ? await db.getMeal(d.editingMealId) : null;
    const meal = {
      id: d.editingMealId ?? db.uid(),
      date: d.date,
      mealType: d.mealType,
      source: d.source ?? 'manual',
      items: cleanItems(),
      note: d.note?.trim() || '',
      photo: app.prefs.storePhotos ? (d.photo ?? (d.source === 'photo' ? d.preview : null)) : (existing?.photo ?? null),
      recognition: d.recognition ?? null,
      createdAt: d.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.saveMeal(meal);
      clearDraft();
      toast(editing ? 'Gespeichert' : 'Eingetragen', 'success');
      navigate(`today?date=${meal.date}`, { replace: true });
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${e.message}`, 'error');
    }
  }

  async function deleteMeal() {
    const ok = await confirmDialog({ title: 'Mahlzeit löschen?', text: 'Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await db.deleteMeal(d.editingMealId);
    clearDraft();
    toast('Gelöscht');
    navigate(`today?date=${d.date}`, { replace: true });
  }

  async function saveRecipe() {
    const name = await promptDialog({ title: 'Als Rezept speichern', label: 'Name des Rezepts', value: d.items.map((i) => i.name).slice(0, 2).join(' & ') });
    if (!name) return;
    await db.saveRecipe({ id: db.uid(), name, items: cleanItems(), createdAt: new Date().toISOString() });
    toast(`Rezept „${name}“ gespeichert`, 'success');
  }

  draw();
}

