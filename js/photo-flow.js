/**
 * Ablauf "Foto → Erkennung → Prüfansicht", gemeinsam für die eingebaute Kamera und die Galerie.
 *
 * Robustheit auf dem Handy:
 * - Fotos werden vor der Auswertung auf max. 1280 px verkleinert (spart viel Arbeitsspeicher).
 * - Der Fortschritt wird gemerkt. Bricht die Seite mitten in der Auswertung ab (Android beendet
 *   Apps bei Speichermangel), meldet die App das beim nächsten Start und wechselt in den Sparmodus.
 */

import * as db from './db.js';
import { app, navigate } from './main.js';
import { loadBitmapScaled, makeThumbnail } from './lib/image.js';
import { nutrientsForGrams } from './lib/nutrition.js';
import { FOOD_CLASSES } from './data/food-classes.js';
import { RecognitionUnavailable, recognizeFood, recognizerStatus } from './recognition/recognizer.js';
import { itemFromCandidate } from './recognition/postprocess.js';
import { compactVector, findMatches } from './recognition/memory.js';
import { classifyPhoto } from './recognition/clip.js';
import { FOOD_BY_ID } from './data/food-index.js';
import { startDraft } from './draft.js';
import { busy, toast } from './ui.js';

const STATE_KEY = 'kt.photoState';
const MAX_SIDE = 1280;

function setState(stage, extra = {}) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ stage, at: Date.now(), ...extra }));
  } catch { /* egal */ }
}

export function photoState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; }
}

/** Beim App-Start: wurde eine Auswertung unterbrochen? Dann Sparmodus einschalten und Bescheid geben. */
export async function checkInterruptedPhoto() {
  const s = photoState();
  if (!s || s.stage === 'done' || s.stage === 'error') return;
  if (Date.now() - s.at > 15 * 60 * 1000) return;
  setState('error', { error: `Unterbrochen bei „${s.stage}“` });
  if (!app.prefs.lowMemory) app.prefs = await db.savePrefs({ lowMemory: true });
  toast('Die letzte Foto-Auswertung wurde vom Handy abgebrochen (vermutlich zu wenig Speicher). Die App arbeitet jetzt sparsamer – bitte das Foto nochmal versuchen.', 'error');
}

/**
 * @param {File|Blob|HTMLCanvasElement|ImageBitmap} source Foto aus Kamera oder Galerie
 * @param {{date:string, mealType:string}} ctx
 */
export async function analyzePhoto(source, ctx) {
  const b = busy(recognizerStatus() === 'ready' ? 'Foto wird analysiert …' : 'Foto-Erkennung wird geladen …');
  let bitmap = null;
  try {
    setState('Bild laden');
    bitmap = source instanceof Blob ? await loadBitmapScaled(source, MAX_SIDE) : source;
    const preview = await makeThumbnail(bitmap);

    setState('Erkennung');
    b.update('Foto wird analysiert …');
    const result = await recognizeFood(bitmap, { lowMemory: Boolean(app.prefs.lowMemory) });

    // Zweite Erkennung (MobileCLIP): findet einzelne Komponenten wie Steak, Pommes, Bohnen
    setState('Komponenten');
    b.update('Komponenten werden erkannt …');
    const clip = await classifyPhoto(bitmap, { lowMemory: Boolean(app.prefs.lowMemory) }).catch((e) => {
      console.warn('MobileCLIP nicht verfügbar:', e);
      return null;
    });

    setState('Vorschläge');
    const d = startDraft({ ...ctx, source: 'photo' });
    d.preview = preview;
    d.photo = app.prefs.storePhotos ? preview : null;
    d.recognition = {
      modelVersion: result.modelVersion,
      status: result.status,
      candidates: [...result.items, ...result.alternatives].map(({ label, name, confidence }) => ({ label, name, confidence: Math.round(confidence * 1000) / 1000 })),
    };
    // Foto-Gedächtnis: ähnliche, früher bestätigte Fotos als Vorschlag
    if (result.vector) {
      d.photoVector = compactVector(result.vector);
      d.memoryMatches = findMatches(d.photoVector, await db.allPhotoMemory().catch(() => []));
    }
    const clipComponents = (clip?.components ?? []).map(clipCandidate).filter(Boolean);
    if (clipComponents.length && !(clip.nonFood >= 0.5 && result.status === 'no_food')) {
      // Komponenten von CLIP vorauswählen, beide Erkennungen als Vorschläge anbieten
      d.items = clipComponents.map((c) => toDraftItem(c));
      const seen = new Set();
      d.question = [...clipComponents, ...(clip.candidates.map(clipCandidate).filter(Boolean)), ...result.items, ...result.alternatives]
        .filter((c) => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 9);
    } else if (result.status === 'no_food') {
      d.noFood = true;
      d.question = result.alternatives.length ? result.alternatives : null;
    } else {
      d.items = result.items.map((it) => toDraftItem(it));
      // Unsicher oder mehrere Komponenten: alle Vorschläge zum An- und Abwählen anbieten
      if (result.status === 'uncertain') d.question = [...result.items, ...result.alternatives].slice(0, 7);
    }
    setState('done', { ms: result.durationMs });
    navigate('review', { replace: true });
    return true;
  } catch (e) {
    console.error(e);
    setState('error', { error: String(e?.message ?? e) });
    toast(e instanceof RecognitionUnavailable
      ? e.message
      : `Das Foto konnte nicht ausgewertet werden. Versuch es mit Suche oder Barcode. (Technisch: ${e.message})`, 'error');
    return false;
  } finally {
    if (bitmap && bitmap !== source) bitmap.close?.();
    b.close();
  }
}

/** CLIP-Treffer { ref, confidence } → Vorschlag im gleichen Format wie die Gerichte-Erkennung */
export function clipCandidate({ ref, confidence }) {
  const food = FOOD_BY_ID.get(ref);
  if (!food) return null;
  return { label: `clip:${ref}`, ref, name: food.name, confidence, estimatedGrams: null, per100g: food.per100g, portions: food.portions, servingG: food.servingG };
}

export function toDraftItem(it) {
  const grams = it.estimatedGrams ?? it.portions?.medium_g ?? it.servingG ?? 100;
  const base = {
    id: db.uid(), name: it.name, label: it.label, foodRef: it.ref ?? (it.label ? `model:${it.label}` : null), confidence: it.confidence, servingG: it.servingG ?? null,
    portions: it.portions, per100g: it.per100g, grams, estimated: Boolean(it.estimated), estimateType: it.estimateType ?? null,
  };
  if (!it.per100g) return { ...base, needsNutrition: true, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  return { ...base, ...nutrientsForGrams(it.per100g, grams) };
}

/** Auswahl in der Rückfrage ("Was ist auf deinem Teller?") → Eintrag */
export function draftItemFromCandidate(candidate) {
  if (candidate.ref) return toDraftItem(candidate);
  return toDraftItem(itemFromCandidate(candidate, FOOD_CLASSES));
}
