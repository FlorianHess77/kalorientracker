/**
 * Entwurf der Mahlzeit, die gerade erfasst oder bearbeitet wird.
 * Alle Erfassungswege (Foto, Barcode, Suche, Manuell) sammeln hier ihre Einträge;
 * gespeichert wird erst in der Prüfansicht.
 */

import { uid } from './db.js';
import { nutrientsForGrams } from './lib/nutrition.js';

let draft = null;
let pendingFood = null;
let captureContext = null;

/** Zuletzt gewählter Tag und Mahlzeit im Erfassen-Bildschirm */
export const setCaptureContext = (ctx) => { captureContext = ctx; };
export const getCaptureContext = () => captureContext;

export function startDraft({ date, mealType, source }) {
  draft = { date, mealType, source, items: [], photo: null, preview: null, recognition: null, question: null, noFood: false, note: '', editingMealId: null, createdAt: null };
  return draft;
}

export const getDraft = () => draft;
export const clearDraft = () => { draft = null; };

/** Vorhandenen Entwurf nutzen oder einen neuen für den Erfassen-Kontext anlegen */
export function ensureDraft(fallback) {
  if (!draft) startDraft({ ...(captureContext ?? fallback), source: fallback?.source ?? 'search' });
  return draft;
}

export function draftFromMeal(meal) {
  draft = {
    date: meal.date,
    mealType: meal.mealType,
    source: meal.source,
    items: meal.items.map((i) => ({ ...i })),
    photo: meal.photo ?? null,
    preview: meal.photo ?? null,
    recognition: meal.recognition ?? null,
    question: null,
    noFood: false,
    note: meal.note ?? '',
    editingMealId: meal.id,
    createdAt: meal.createdAt,
  };
  return draft;
}

/** Lebensmittel + Menge → Eintrag einer Mahlzeit (Werte als Schnappschuss) */
export function itemFromFood(food, grams) {
  return {
    id: uid(),
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    foodRef: food.id ?? null,
    per100g: food.per100g,
    portions: food.portions ?? null,
    servingG: food.servingG ?? null,
    confidence: null,
    grams,
    ...nutrientsForGrams(food.per100g, grams),
  };
}

export function addItem(item) {
  draft.items.push(item);
}

export function replaceItem(itemId, item) {
  const i = draft.items.findIndex((x) => x.id === itemId);
  if (i >= 0) draft.items[i] = item;
  else draft.items.push(item);
}

export const setPendingFood = (food) => { pendingFood = food; };
export const getPendingFood = () => pendingFood;
