/** Manuelle Eingabe: Nährwerte für eine Menge eintragen, optional als eigenes Lebensmittel merken. */

import * as db from '../db.js';
import { navigate, goBack } from '../main.js';
import { parseDecimal, todayISO } from '../lib/dates.js';
import { isPlausiblePer100g, per100gFrom } from '../lib/nutrition.js';
import { ensureDraft, itemFromFood, replaceItem } from '../draft.js';
import { button, field, h, header, notice, numberInput, toast } from '../ui.js';

export async function render(view, params) {
  const v = {
    name: params.name || '',
    brand: '',
    barcode: (params.barcode || '').replace(/\D/g, ''),
    grams: '100',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    save: Boolean(params.barcode),
  };
  const errorBox = h('div');

  function submit(e) {
    e.preventDefault();
    const grams = parseDecimal(v.grams);
    const nutrients = {
      kcal: parseDecimal(v.kcal),
      protein_g: parseDecimal(v.protein) || 0,
      carbs_g: parseDecimal(v.carbs) || 0,
      fat_g: parseDecimal(v.fat) || 0,
    };
    const errors = [];
    if (!v.name.trim()) errors.push('Bitte einen Namen eingeben.');
    if (!(grams > 0 && grams <= 5000)) errors.push('Bitte eine Menge zwischen 1 und 5000 g angeben.');
    if (!(nutrients.kcal >= 0)) errors.push('Bitte die Kalorien angeben.');
    let per100g = null;
    if (!errors.length) {
      per100g = per100gFrom(nutrients, grams);
      if (!isPlausiblePer100g(per100g)) errors.push('Die Werte wirken unplausibel (z. B. mehr als 100 g Nährstoffe pro 100 g). Bitte prüfen.');
    }
    errorBox.replaceChildren(...errors.map((m) => notice(m, 'error')));
    if (errors.length) return;

    const food = {
      id: v.save ? db.uid() : null,
      source: 'custom',
      name: v.name.trim(),
      brand: v.brand.trim() || null,
      barcode: v.barcode || null,
      per100g,
      servingG: Math.round(grams),
    };
    const finish = () => {
      const d = ensureDraft({ date: todayISO(), mealType: 'snack', source: 'manual' });
      const item = itemFromFood(food, Math.round(grams));
      if (params.replace) replaceItem(params.replace, item);
      else d.items.push(item);
      navigate('review');
    };
    if (v.save) {
      db.saveFood(food).then(() => { toast('Als eigenes Lebensmittel gespeichert', 'success'); finish(); })
        .catch((err) => toast(`Speichern fehlgeschlagen: ${err.message}`, 'error'));
    } else {
      finish();
    }
  }

  const text = (key, props = {}) => h('input', { type: 'text', value: v[key], oninput: (e) => { v[key] = e.target.value; }, ...props });
  const num = (key, suffix) => numberInput({ value: v[key], suffix, onInput: (x) => { v[key] = x; } });

  view.append(
    header('Selbst eintragen', { back: () => goBack() }),
    h('form', { class: 'stack', onsubmit: submit, novalidate: true },
      field('Name', text('name', { placeholder: 'z. B. Omas Gulasch', required: true, maxlength: '80' })),
      field('Marke (optional)', text('brand', { maxlength: '60' })),
      v.barcode ? field('Barcode', text('barcode', { inputmode: 'numeric' })) : null,
      field('Menge', num('grams', 'g'), 'Alle Werte unten beziehen sich auf diese Menge (z. B. laut Verpackung pro 100 g oder pro Portion).'),
      field('Kalorien', num('kcal', 'kcal')),
      h('div', { class: 'grid-3' }, field('Eiweiß', num('protein', 'g')), field('Kohlenh.', num('carbs', 'g')), field('Fett', num('fat', 'g'))),
      h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: v.save, onchange: (e) => { v.save = e.target.checked; } }),
        h('span', null, 'Als eigenes Lebensmittel speichern (für die Suche und den Barcode-Scanner)')),
      errorBox,
      h('div', { class: 'sticky-actions' }, button(params.replace ? 'Übernehmen' : 'Hinzufügen', null, { type: 'submit', block: true, iconName: 'plus' }))),
  );
  view.querySelector('input')?.focus();
}
