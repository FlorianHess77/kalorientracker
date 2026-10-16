/** Nährwert-Rechnungen. per100g = { kcal, protein_g, carbs_g, fat_g } */

const round1 = (n) => Math.round(n * 10) / 10;

export const ZERO = Object.freeze({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

/** Nährwerte für eine Portion in Gramm. kcal ganzzahlig, Makros auf 0,1 g. */
export function nutrientsForGrams(per100g, grams) {
  const f = Math.max(0, Number(grams) || 0) / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein_g: round1(per100g.protein_g * f),
    carbs_g: round1(per100g.carbs_g * f),
    fat_g: round1(per100g.fat_g * f),
  };
}

/** Umgekehrt: aus Werten für eine Menge die Werte pro 100 g */
export function per100gFrom(nutrients, grams) {
  const g = Number(grams);
  if (!(g > 0)) throw new Error('Menge muss größer als 0 sein');
  const f = 100 / g;
  return {
    kcal: round1(nutrients.kcal * f),
    protein_g: round1(nutrients.protein_g * f),
    carbs_g: round1(nutrients.carbs_g * f),
    fat_g: round1(nutrients.fat_g * f),
  };
}

export function sumNutrients(list) {
  const t = list.reduce(
    (acc, n) => ({
      kcal: acc.kcal + (n.kcal || 0),
      protein_g: acc.protein_g + (n.protein_g || 0),
      carbs_g: acc.carbs_g + (n.carbs_g || 0),
      fat_g: acc.fat_g + (n.fat_g || 0),
    }),
    { ...ZERO },
  );
  return { kcal: Math.round(t.kcal), protein_g: round1(t.protein_g), carbs_g: round1(t.carbs_g), fat_g: round1(t.fat_g) };
}

/** Item mit neuer Menge neu berechnen (Items ohne per100g behalten ihre festen Werte) */
export function withGrams(item, grams) {
  if (!item.per100g) return { ...item, grams };
  return { ...item, grams, ...nutrientsForGrams(item.per100g, grams) };
}

export function mealTotals(meal) {
  return sumNutrients(meal.items || []);
}

export function dayTotals(meals) {
  return sumNutrients(meals.flatMap((m) => m.items || []));
}

/** Anteil der Kalorien aus Makros in Prozent (gerundet, Summe 100 bei Werten > 0) */
export function macroSplit({ protein_g, carbs_g, fat_g }) {
  const p = protein_g * 4;
  const c = carbs_g * 4;
  const f = fat_g * 9;
  const total = p + c + f;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round((p / total) * 100);
  const fat = Math.round((f / total) * 100);
  return { protein, carbs: 100 - protein - fat, fat };
}

/** Plausibilitätsprüfung für per100g-Werte (z. B. aus Open Food Facts) */
export function isPlausiblePer100g(v) {
  if (!v) return false;
  const ok = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
  return ok(v.kcal, 950) && ok(v.protein_g, 100) && ok(v.carbs_g, 100) && ok(v.fat_g, 100)
    && v.protein_g + v.carbs_g + v.fat_g <= 105;
}
