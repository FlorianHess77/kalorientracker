/** CSV-Export, Kalender-Erinnerungen (.ics) und Backup-Prüfung – reine Funktionen. */

import { mealLabel } from './dates.js';

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Semikolon-getrennt, damit Excel im deutschsprachigen Raum die Spalten richtig trennt */
export function toCSV(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function mealsToCSV(meals) {
  const rows = [['Datum', 'Mahlzeit', 'Lebensmittel', 'Menge (g)', 'kcal', 'Eiweiß (g)', 'Kohlenhydrate (g)', 'Fett (g)', 'Quelle']];
  const sorted = [...meals].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  for (const m of sorted) {
    for (const it of m.items || []) {
      rows.push([m.date, mealLabel(m.mealType), it.name, it.grams ?? '', it.kcal, it.protein_g, it.carbs_g, it.fat_g, m.source]);
    }
  }
  return toCSV(rows);
}

export function weightsToCSV(weights) {
  return toCSV([['Datum', 'Gewicht (kg)'], ...[...weights].sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, w.kg])]);
}

export function waterToCSV(water) {
  return toCSV([['Datum', 'Wasser (ml)'], ...[...water].sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, w.ml])]);
}

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const pad = (n) => String(n).padStart(2, '0');

/**
 * Wiederkehrende Kalender-Termine mit Alarm. Web-Apps können ohne Server keine
 * zuverlässigen Push-Erinnerungen senden – der Kalender des Handys kann das.
 * @param {{title:string, time:string /* "HH:MM" *\/, rrule:string, description?:string}[]} events
 * @param {Date} start Datum des ersten Termins
 */
export function buildICS(events, start = new Date(), uidSeed = 'kalorientracker') {
  const ymd = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kalorientracker//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  events.forEach((e, i) => {
    const [hh, mm] = e.time.split(':');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidSeed}-${i}-${ymd}@kalorientracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${pad(hh)}${pad(mm)}00`,
      'DURATION:PT5M',
      `RRULE:${e.rrule}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.description ?? 'Erinnerung aus deinem Kalorientracker')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(e.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export const BACKUP_FORMAT = 'kalorientracker-backup';
export const BACKUP_VERSION = 1;

/** Prüft eine Backup-Datei grob, bevor sie importiert wird */
export function validateBackup(data) {
  if (!data || data.format !== BACKUP_FORMAT) return 'Das ist keine Backup-Datei dieser App.';
  if (data.version > BACKUP_VERSION) return 'Die Backup-Datei stammt aus einer neueren App-Version.';
  for (const key of ['settings', 'goals', 'meals', 'foods', 'recipes', 'favorites', 'weights', 'water']) {
    if (!Array.isArray(data.stores?.[key])) return `Im Backup fehlt der Bereich "${key}".`;
  }
  return null;
}
