/**
 * Lokale Datenbank (IndexedDB). Alle Daten bleiben auf dem Gerät.
 *
 * Stores:
 *  settings  { key, value }            – 'profile', 'prefs'
 *  goals     { validFrom, kcal, protein_g, carbs_g, fat_g, water_ml, isManual }
 *  meals     { id, date, mealType, source, items[], photo?: Blob, note, createdAt, recognition? }
 *  foods     { id, source: 'custom'|'off', name, brand, barcode, per100g, servingG, updatedAt }
 *  recipes   { id, name, items[], createdAt }
 *  favorites { key, kind: 'food'|'recipe', food?, recipeId?, name, createdAt }
 *  weights   { date, kg }
 *  water     { date, ml }
 *  photoMemory { id (= Mahlzeit), date, vector: { i, v }, items[], createdAt }
 */

import { BACKUP_FORMAT, BACKUP_VERSION } from './lib/export.js';

const DB_NAME = 'kalorientracker';
const DB_VERSION = 2;
const STORE_DEFS = {
  settings: { keyPath: 'key' },
  goals: { keyPath: 'validFrom' },
  meals: { keyPath: 'id', indexes: [['date', 'date']] },
  foods: { keyPath: 'id', indexes: [['barcode', 'barcode']] },
  recipes: { keyPath: 'id' },
  favorites: { keyPath: 'key' },
  weights: { keyPath: 'date' },
  water: { keyPath: 'date' },
  photoMemory: { keyPath: 'id' }, // Fingerabdrücke bestätigter Fotos (keine Bilder)
};
export const STORE_NAMES = Object.keys(STORE_DEFS);

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, def] of Object.entries(STORE_DEFS)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [indexName, keyPath] of def.indexes || []) store.createIndex(indexName, keyPath);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Die App ist in einem anderen Tab geöffnet. Bitte dort schließen.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

const promisify = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Führt fn in einer Transaktion aus. fn darf nur IndexedDB-Anfragen verketten. */
async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, (e) => { try { t.abort(); } catch { /* schon beendet */ } reject(e); });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

export const get = (store, key) => tx(store, 'readonly', (t) => promisify(t.objectStore(store).get(key)));
export const getAll = (store) => tx(store, 'readonly', (t) => promisify(t.objectStore(store).getAll()));
export const put = (store, value) => tx(store, 'readwrite', (t) => promisify(t.objectStore(store).put(value)));
export const del = (store, key) => tx(store, 'readwrite', (t) => promisify(t.objectStore(store).delete(key)));
const getAllByIndex = (store, index, query) =>
  tx(store, 'readonly', (t) => promisify(t.objectStore(store).index(index).getAll(query)));

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────── Einstellungen & Profil ─────────────
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => put('settings', { key, value });

export const DEFAULT_PREFS = { storePhotos: false };
export const getProfile = () => getSetting('profile', null);
export const saveProfile = (profile) => setSetting('profile', profile);
export async function getPrefs() {
  return { ...DEFAULT_PREFS, ...(await getSetting('prefs', {})) };
}
export async function savePrefs(patch) {
  const prefs = { ...(await getPrefs()), ...patch };
  await setSetting('prefs', prefs);
  return prefs;
}

// ───────────── Ziele ─────────────
export async function getGoals() {
  const goals = await getAll('goals');
  return goals.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}

/** Das am angegebenen Tag gültige Ziel (vor dem ersten Ziel: das erste) */
export function goalFor(goals, date) {
  if (!goals.length) return null;
  let current = goals[0];
  for (const g of goals) if (g.validFrom <= date) current = g;
  return current;
}

export const saveGoal = (goal) => put('goals', goal);

// ───────────── Mahlzeiten ─────────────
export const getMeal = (id) => get('meals', id);
export const saveMeal = (meal) => put('meals', meal);
export const deleteMeal = (id) => del('meals', id);
export async function mealsForDate(date) {
  const meals = await getAllByIndex('meals', 'date', date);
  return meals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const mealsInRange = (start, end) => getAllByIndex('meals', 'date', IDBKeyRange.bound(start, end));
export const allMeals = () => getAll('meals');

/** Alle Tage, an denen etwas eingetragen wurde */
export function datesWithMeals() {
  return tx('meals', 'readonly', (t) =>
    new Promise((resolve, reject) => {
      const dates = new Set();
      const req = t.objectStore('meals').index('date').openKeyCursor(null, 'nextunique');
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(dates);
        dates.add(cursor.key);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    }),
  );
}

// ───────────── Lebensmittel ─────────────
export const saveFood = (food) => put('foods', { ...food, updatedAt: new Date().toISOString() });
export const getFood = (id) => get('foods', id);
export const deleteFood = (id) => del('foods', id);
export const allFoods = () => getAll('foods');
export async function foodByBarcode(barcode) {
  const found = await getAllByIndex('foods', 'barcode', barcode);
  // eigene Einträge haben Vorrang vor dem Open-Food-Facts-Cache
  return found.find((f) => f.source === 'custom') ?? found[0] ?? null;
}

// ───────────── Rezepte & Favoriten ─────────────
export const allRecipes = () => getAll('recipes');
export const getRecipe = (id) => get('recipes', id);
export const saveRecipe = (recipe) => put('recipes', recipe);
export const deleteRecipe = (id) => del('recipes', id);

export const allFavorites = () => getAll('favorites');
export const favoriteKeyForFood = (food) => `food:${food.id}`;
export async function isFavorite(key) {
  return Boolean(await get('favorites', key));
}
export async function toggleFavoriteFood(food) {
  const key = favoriteKeyForFood(food);
  if (await isFavorite(key)) {
    await del('favorites', key);
    return false;
  }
  const { id, source, name, brand, barcode, per100g, servingG } = food;
  await put('favorites', { key, kind: 'food', name, food: { id, source, name, brand, barcode, per100g, servingG }, createdAt: new Date().toISOString() });
  return true;
}

// ───────────── Gewicht & Wasser ─────────────
export async function allWeights() {
  return (await getAll('weights')).sort((a, b) => a.date.localeCompare(b.date));
}
export const setWeight = (date, kg) => put('weights', { date, kg });
export const deleteWeight = (date) => del('weights', date);

export async function waterFor(date) {
  return (await get('water', date))?.ml ?? 0;
}
export async function addWater(date, deltaMl) {
  return tx('water', 'readwrite', (t) => {
    const store = t.objectStore('water');
    return promisify(store.get(date)).then((row) => {
      const ml = Math.max(0, Math.min(10000, (row?.ml ?? 0) + deltaMl));
      return promisify(store.put({ date, ml })).then(() => ml);
    });
  });
}
export const allWater = () => getAll('water');

// ───────────── Foto-Gedächtnis ─────────────
export const allPhotoMemory = () => getAll('photoMemory');
export const getPhotoMemory = (id) => get('photoMemory', id);
export const deletePhotoMemory = (id) => del('photoMemory', id);
export async function savePhotoMemory(entry, maxEntries = 400) {
  await put('photoMemory', entry);
  const all = await getAll('photoMemory');
  if (all.length > maxEntries) {
    const old = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, all.length - maxEntries);
    for (const e of old) await del('photoMemory', e.id);
  }
}

// ───────────── Backup, Export, Löschen ─────────────
export async function exportAll() {
  const stores = {};
  for (const name of STORE_NAMES) {
    const rows = await getAll(name);
    // Fotos (Blobs) nicht ins JSON-Backup – hält die Datei klein
    stores[name] = name === 'meals' ? rows.map(({ photo, ...rest }) => rest) : rows;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), stores };
}

export async function importAll(data) {
  await tx(STORE_NAMES, 'readwrite', (t) =>
    Promise.all(
      STORE_NAMES.map((name) => {
        const store = t.objectStore(name);
        return promisify(store.clear()).then(() => Promise.all((data.stores[name] || []).map((row) => promisify(store.put(row)))));
      }),
    ),
  );
}

export async function deleteEverything() {
  const db = await openDB().catch(() => null);
  db?.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/** Browser bitten, die Daten nicht automatisch zu löschen (v. a. wichtig auf iOS) */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
