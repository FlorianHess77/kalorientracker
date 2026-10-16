/**
 * Zielberechnung – reine Funktionen, vollständig getestet (tests/calc.test.mjs).
 *
 * Grundumsatz nach Mifflin-St Jeor:
 *   Männer:  10·kg + 6,25·cm − 5·Alter + 5
 *   Frauen:  10·kg + 6,25·cm − 5·Alter − 161
 * Gesamtbedarf = Grundumsatz × Aktivitätsfaktor
 * Ziel = Gesamtbedarf ± (kg pro Woche × 7700 kcal / 7)
 */

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_OPTIONS = [
  { value: 'sedentary', title: 'Kaum aktiv', description: 'Büro, wenig Bewegung, kein Sport' },
  { value: 'light', title: 'Leicht aktiv', description: 'Viel zu Fuß oder 1–2× Sport pro Woche' },
  { value: 'moderate', title: 'Mäßig aktiv', description: '3–4× Sport pro Woche' },
  { value: 'active', title: 'Sehr aktiv', description: '5–6× Sport pro Woche oder körperliche Arbeit' },
  { value: 'very_active', title: 'Extrem aktiv', description: 'Tägliches hartes Training plus körperliche Arbeit' },
];

export const GOAL_OPTIONS = [
  { value: 'lose', title: 'Abnehmen', description: 'Gewicht reduzieren' },
  { value: 'maintain', title: 'Gewicht halten', description: 'Bewusst essen, Gewicht stabil halten' },
  { value: 'gain', title: 'Zunehmen', description: 'Gewicht bzw. Muskeln aufbauen' },
];

export const RATE_OPTIONS = {
  lose: [
    { value: 0.25, label: 'Gemächlich' },
    { value: 0.5, label: 'Empfohlen' },
    { value: 0.75, label: 'Zügig' },
    { value: 1.0, label: 'Sehr zügig' },
  ],
  maintain: [{ value: 0, label: 'Gewicht halten' }],
  gain: [
    { value: 0.25, label: 'Langsam (empfohlen)' },
    { value: 0.5, label: 'Zügig' },
  ],
};

export const KCAL_PER_KG = 7700;
/** Untergrenzen für die Tagesenergie – darunter rechnet die App nie. */
export const MIN_KCAL = { female: 1200, male: 1500 };
export const MAX_KCAL = 6000;
export const MIN_AGE = 18;
export const MAX_AGE = 100;
export const UNDERWEIGHT_BMI = 18.5;

export function ageOn(birthDate, today) {
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export function bmi(weightKg, heightCm) {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function canChooseLose(weightKg, heightCm) {
  return bmi(weightKg, heightCm) >= UNDERWEIGHT_BMI;
}

export function mifflinStJeor(basis, weightKg, heightCm, age) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (basis === 'male' ? 5 : -161);
}

export const roundTo = (n, step) => Math.round(n / step) * step;

/** Makros: Eiweiß nach g/kg (max. 30 % der kcal), Fett 25 %, Rest Kohlenhydrate. */
export function macrosFor(kcal, weightKg, goal) {
  const proteinPerKg = goal === 'maintain' ? 1.6 : 1.8;
  const protein = Math.min(weightKg * proteinPerKg, (kcal * 0.3) / 4);
  const fat = (kcal * 0.25) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { protein_g: Math.round(protein), carbs_g: Math.round(carbs), fat_g: Math.round(fat) };
}

export function waterFor(weightKg) {
  return Math.min(4000, Math.max(1500, roundTo(weightKg * 35, 250)));
}

/**
 * @param {{basis:'male'|'female', weightKg:number, heightCm:number, age:number,
 *          activity:string, goal:'lose'|'maintain'|'gain', weeklyRateKg:number}} input
 */
export function calculateGoals(input) {
  const warnings = [];
  let goal = input.goal;
  let rate = goal === 'maintain' ? 0 : Math.max(0, input.weeklyRateKg || 0);

  if (goal === 'lose' && !canChooseLose(input.weightKg, input.heightCm)) {
    warnings.push('underweight_no_loss');
    goal = 'maintain';
    rate = 0;
  }

  const bmr = mifflinStJeor(input.basis, input.weightKg, input.heightCm, input.age);
  const tdee = bmr * ACTIVITY_FACTORS[input.activity];
  const delta = (rate * KCAL_PER_KG) / 7;
  const dailyDelta = goal === 'lose' ? -delta : goal === 'gain' ? delta : 0;

  if (goal === 'lose' && (rate > input.weightKg * 0.01 || delta > tdee * 0.25)) {
    warnings.push('aggressive_rate');
  }

  let kcal = roundTo(tdee + dailyDelta, 10);
  const minimum = MIN_KCAL[input.basis];
  if (kcal < minimum) {
    kcal = minimum;
    warnings.push('clamped_to_minimum');
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    dailyDelta: Math.round(dailyDelta),
    ...macrosFor(kcal, input.weightKg, goal),
    water_ml: waterFor(input.weightKg),
    effectiveGoal: goal,
    warnings,
  };
}

export const kcalFromMacros = (m) => m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;

/** Prüft manuell eingegebene Ziele. below_minimum und too_high blockieren das Speichern. */
export function checkManualGoals(kcal, macros, basis) {
  const issues = [];
  if (!Number.isFinite(kcal) || kcal < MIN_KCAL[basis]) issues.push('below_minimum');
  if (kcal > MAX_KCAL) issues.push('too_high');
  const fromMacros = kcalFromMacros(macros);
  if (kcal > 0 && Math.abs(fromMacros - kcal) / kcal > 0.1) issues.push('macro_mismatch');
  return issues;
}

export const WARNING_TEXT = {
  clamped_to_minimum:
    'Dein rechnerisches Ziel lag unter der sicheren Mindestmenge. Wir haben es angehoben – wähle bei Bedarf ein langsameres Tempo.',
  aggressive_rate:
    'Dieses Tempo ist sehr ambitioniert. Mehr als ca. 1 % des Körpergewichts pro Woche ist schwer durchzuhalten und kann Muskelmasse kosten.',
  underweight_no_loss:
    'Dein BMI liegt im Untergewicht-Bereich. Wir berechnen deshalb kein Abnehmziel. Bei Fragen sprich bitte mit einer Ärztin oder einem Arzt.',
};

export const MANUAL_ISSUE_TEXT = {
  below_minimum: 'Das liegt unter der sicheren Mindestmenge von {min} kcal.',
  too_high: 'Bitte maximal 6000 kcal eingeben.',
  macro_mismatch: 'Die Makros ergeben {macroKcal} kcal und passen nicht ganz zum Kalorienziel. Speichern ist trotzdem möglich.',
};
