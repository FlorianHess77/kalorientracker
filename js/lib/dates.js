/** Datums-Helfer. Tage immer als lokales ISO-Datum "YYYY-MM-DD". */

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, days) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Alle Tage von start bis end (inklusive) */
export function daysBetween(startIso, endIso) {
  const out = [];
  for (let d = startIso; d <= endIso; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(fromISODate(s)) === s;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jän.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export function weekdayShort(iso) {
  return WEEKDAYS[fromISODate(iso).getDay()];
}

/** "Heute", "Gestern", "Morgen" oder "Mo, 12. Okt." */
export function formatDayLabel(iso, today = todayISO()) {
  if (iso === today) return 'Heute';
  if (iso === addDays(today, -1)) return 'Gestern';
  if (iso === addDays(today, 1)) return 'Morgen';
  const d = fromISODate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function formatShortDate(iso) {
  const d = fromISODate(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Komma oder Punkt als Dezimaltrenner akzeptieren. Leere Eingabe → NaN. */
export function parseDecimal(input) {
  const s = String(input ?? '').trim();
  if (s === '') return NaN;
  return Number(s.replace(',', '.'));
}

export function formatNumber(n, digits = 0) {
  if (!Number.isFinite(n)) return '–';
  return n.toFixed(digits).replace('.', ',');
}

/** Mahlzeit passend zur Uhrzeit vorschlagen */
export function mealTypeForTime(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 4.5 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Frühstück' },
  { value: 'lunch', label: 'Mittagessen' },
  { value: 'dinner', label: 'Abendessen' },
  { value: 'snack', label: 'Snacks' },
];

export const mealLabel = (type) => MEAL_TYPES.find((m) => m.value === type)?.label ?? type;
