/**
 * Open Food Facts – freie Lebensmitteldatenbank (Daten unter ODbL-Lizenz).
 * Limits laut Dokumentation: 15 Produktabfragen und 10 Suchen pro Minute.
 * Deshalb: Ergebnisse lokal zwischenspeichern und nur auf Knopfdruck suchen.
 */

import { isPlausiblePer100g } from './lib/nutrition.js';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,generic_name_de,brands,nutriments,serving_quantity';

export class OffError extends Error {}

const recentSearches = [];
function checkSearchLimit() {
  const now = Date.now();
  while (recentSearches.length && now - recentSearches[0] > 60_000) recentSearches.shift();
  if (recentSearches.length >= 9) {
    throw new OffError('Zu viele Suchen in kurzer Zeit. Bitte eine Minute warten.');
  }
  recentSearches.push(now);
}

async function getJSON(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new OffError('Keine Verbindung zu Open Food Facts. Bist du online?');
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status === 503) throw new OffError('Open Food Facts ist gerade überlastet. Bitte gleich nochmal versuchen.');
  if (!res.ok) throw new OffError(`Open Food Facts antwortet mit Fehler ${res.status}.`);
  return res.json();
}

const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

/** Produkt aus Open Food Facts → App-Format. Gibt null zurück, wenn Nährwerte fehlen. */
export function productToFood(p, fallbackCode) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal) && Number.isFinite(num(n.energy_100g))) kcal = num(n.energy_100g) / 4.184; // kJ → kcal
  const per100g = {
    kcal: Math.round(kcal * 10) / 10,
    protein_g: Number.isFinite(num(n.proteins_100g)) ? num(n.proteins_100g) : 0,
    carbs_g: Number.isFinite(num(n.carbohydrates_100g)) ? num(n.carbohydrates_100g) : 0,
    fat_g: Number.isFinite(num(n.fat_100g)) ? num(n.fat_100g) : 0,
  };
  const code = String(p.code || fallbackCode || '');
  const serving = num(p.serving_quantity);
  return {
    id: `off:${code}`,
    source: 'off',
    barcode: code,
    name: (p.product_name_de || p.product_name || p.generic_name_de || '').trim() || 'Unbenanntes Produkt',
    brand: (p.brands || '').split(',')[0].trim() || null,
    per100g: isPlausiblePer100g(per100g) ? per100g : null,
    servingG: serving > 0 && serving < 2000 ? Math.round(serving) : null,
  };
}

export async function fetchProductByBarcode(code, { signal } = {}) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length < 6) throw new OffError('Der Barcode ist zu kurz.');
  const data = await getJSON(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, signal);
  if (!data || data.status !== 1 || !data.product) return null;
  return productToFood(data.product, clean);
}

export async function searchProducts(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];
  checkSearchLimit();
  const url =
    `${BASE}/cgi/search.pl?action=process&json=1&search_simple=1&page_size=24` +
    `&search_terms=${encodeURIComponent(q)}&fields=${FIELDS}`;
  const data = await getJSON(url, signal);
  return (data?.products || []).map((p) => productToFood(p)).filter((f) => f.per100g && f.barcode);
}
