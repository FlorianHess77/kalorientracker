/** Gespeicherte Mahlzeit öffnen → in den Entwurf laden und in der Prüfansicht bearbeiten. */

import * as db from '../db.js';
import { navigate } from '../main.js';
import { draftFromMeal } from '../draft.js';
import { toast } from '../ui.js';

export async function render(view, params) {
  const meal = params.id ? await db.getMeal(params.id) : null;
  if (!meal) {
    toast('Diese Mahlzeit gibt es nicht mehr.');
    navigate('today', { replace: true });
    return;
  }
  draftFromMeal(meal);
  navigate('review', { replace: true });
}
