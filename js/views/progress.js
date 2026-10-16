/** Fortschritt: Gewicht, Kalorien pro Tag, Zielerreichung, Makroverteilung, Streak. */

import * as db from '../db.js';
import { goalForDate, navigate } from '../main.js';
import { addDays, daysBetween, formatDayLabel, formatShortDate, isValidISODate, parseDecimal, todayISO, weekdayShort } from '../lib/dates.js';
import { barChart, lineChart } from '../lib/charts.js';
import { computeStreak, dailySeries, summarize, weightChange } from '../lib/stats.js';
import { button, fmt, h, icon, iconButton, notice, numberInput, segmented, toast, confirmDialog } from '../ui.js';

const RANGES = [{ value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }, { value: '90', label: '90 Tage' }];

export async function render(view, params) {
  const range = RANGES.some((r) => r.value === params.range) ? params.range : '7';
  const days = Number(range);
  const today = todayISO();
  const start = addDays(today, -(days - 1));

  const [meals, weights, dates] = await Promise.all([db.mealsInRange(start, today), db.allWeights(), db.datesWithMeals()]);
  const series = dailySeries(meals, start, today, goalForDate);
  const sum = summarize(series);
  const streak = computeStreak(dates, today);
  const weightsInRange = weights.filter((w) => w.date >= start);
  const latest = weights.at(-1);
  const change = weightChange(weightsInRange);

  view.append(
    h('header', { class: 'topbar' }, h('span', { class: 'topbar-spacer' }), h('h1', null, 'Fortschritt'), h('span', { class: 'topbar-spacer' })),
    segmented(RANGES, range, (v) => navigate(`progress?range=${v}`, { replace: true })),
  );

  // ───────────── Kennzahlen ─────────────
  view.append(
    h('section', { class: 'stat-grid' },
      statCard('Ø Kalorien', sum.loggedDays ? `${fmt(sum.avgKcal)}` : '–', 'pro eingetragenem Tag'),
      statCard('Im Ziel', `${sum.onTargetDays}/${sum.loggedDays}`, 'Tage (± 10 %)'),
      statCard('Eingetragen', `${sum.loggedDays}/${days}`, 'Tage'),
      statCard('Serie', `${streak}`, streak === 1 ? 'Tag in Folge' : 'Tage in Folge', 'flame')),
  );

  // ───────────── Kalorien-Diagramm ─────────────
  const chartData = series.map((d) => ({
    label: days <= 7 ? weekdayShort(d.date) : formatShortDate(d.date),
    value: d.kcal, goal: d.goalKcal, logged: d.logged,
  }));
  const kcalCard = h('section', { class: 'card' }, h('h2', null, 'Kalorien pro Tag'));
  if (sum.loggedDays) {
    kcalCard.append(h('div', { class: 'chart-wrap', html: barChart(chartData) }),
      h('p', { class: 'muted small' }, 'Gestrichelt: dein Ziel. Rot: mehr als 10 % darüber.'));
  } else {
    kcalCard.append(h('p', { class: 'muted' }, 'In diesem Zeitraum ist noch nichts eingetragen.'));
  }
  view.append(kcalCard);

  // ───────────── Makros ─────────────
  if (sum.loggedDays) {
    view.append(
      h('section', { class: 'card' },
        h('h2', null, 'Durchschnittliche Makros'),
        h('div', { class: 'split-bar', role: 'img', 'aria-label': `Eiweiß ${sum.split.protein} %, Kohlenhydrate ${sum.split.carbs} %, Fett ${sum.split.fat} %` },
          h('span', { style: { width: `${sum.split.protein}%`, background: 'var(--protein)' } }),
          h('span', { style: { width: `${sum.split.carbs}%`, background: 'var(--carbs)' } }),
          h('span', { style: { width: `${sum.split.fat}%`, background: 'var(--fat)' } })),
        h('div', { class: 'macro-grid' },
          legend('Eiweiß', `${sum.avgProtein} g`, `${sum.split.protein} %`, 'var(--protein)'),
          legend('Kohlenh.', `${sum.avgCarbs} g`, `${sum.split.carbs} %`, 'var(--carbs)'),
          legend('Fett', `${sum.avgFat} g`, `${sum.split.fat} %`, 'var(--fat)'))),
    );
  }

  // ───────────── Gewicht ─────────────
  let weightValue = latest ? String(latest.kg).replace('.', ',') : '';
  let weightDate = today;
  const saveWeight = async () => {
    const kg = parseDecimal(weightValue);
    if (!(kg >= 25 && kg <= 400)) { toast('Bitte ein Gewicht zwischen 25 und 400 kg eingeben.', 'error'); return; }
    if (!isValidISODate(weightDate) || weightDate > today) { toast('Bitte ein gültiges Datum wählen.', 'error'); return; }
    await db.setWeight(weightDate, Math.round(kg * 10) / 10);
    toast('Gewicht gespeichert', 'success');
    navigate(`progress?range=${range}&keepScroll=1`, { replace: true });
  };

  const points = weightsInRange.map((w) => ({ x: daysBetween(start, w.date).length - 1, y: w.kg, label: formatShortDate(w.date) }));
  view.append(
    h('section', { class: 'card' },
      h('div', { class: 'card-row' },
        h('h2', null, 'Gewicht'),
        latest ? h('span', { class: 'muted' }, `${String(latest.kg).replace('.', ',')} kg`,
          change !== null ? h('span', { class: ['delta', change < 0 ? 'down' : change > 0 ? 'up' : ''] }, ` ${change > 0 ? '+' : ''}${String(change).replace('.', ',')} kg`) : null) : null),
      points.length >= 2
        ? h('div', { class: 'chart-wrap', html: lineChart(points, { xMax: days - 1 }) })
        : h('p', { class: 'muted small' }, 'Trag dein Gewicht regelmäßig ein (z. B. 1× pro Woche morgens), dann siehst du hier den Verlauf.'),
      h('div', { class: 'weight-form' },
        numberInput({ value: weightValue, suffix: 'kg', placeholder: 'Gewicht', onInput: (v) => { weightValue = v; } }),
        h('input', { type: 'date', value: weightDate, max: today, 'aria-label': 'Datum', onchange: (e) => { weightDate = e.target.value; } }),
        button('Speichern', saveWeight, { small: true })),
      weights.length
        ? h('details', null, h('summary', null, 'Alle Einträge'),
          h('ul', { class: 'list' }, [...weights].reverse().slice(0, 60).map((w) =>
            h('li', { class: 'list-row static' },
              h('span', { class: 'list-text' }, formatDayLabel(w.date)),
              h('strong', null, `${String(w.kg).replace('.', ',')} kg`),
              iconButton('trash', async () => {
                if (!(await confirmDialog({ title: 'Eintrag löschen?', text: `${formatDayLabel(w.date)}: ${String(w.kg).replace('.', ',')} kg`, confirmLabel: 'Löschen', danger: true }))) return;
                await db.deleteWeight(w.date);
                navigate(`progress?range=${range}&keepScroll=1`, { replace: true });
              }, 'Löschen')))))
        : null),
  );

  if (sum.loggedDays && sum.avgKcal < 1000) {
    view.append(notice('Deine durchschnittliche Energiezufuhr ist sehr niedrig. Falls das nicht nur an fehlenden Einträgen liegt, sprich bitte mit einer Ärztin oder einem Arzt.', 'info'));
  }
}

function statCard(label, value, sub, iconName) {
  return h('div', { class: 'stat-card' }, h('span', { class: 'muted small' }, label),
    h('strong', null, iconName ? icon(iconName, 18) : null, value), h('span', { class: 'muted small' }, sub));
}

function legend(label, grams, pct, color) {
  return h('div', { class: 'macro-box' }, h('span', { class: 'dot', style: { background: color } }), h('strong', null, grams), h('span', null, `${label} · ${pct}`));
}
