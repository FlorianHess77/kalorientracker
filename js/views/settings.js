/** Einstellungen: Ziele, Fotos, Erinnerungen, App installieren, Export/Backup, Löschen, Infos. */

import * as db from '../db.js';
import { APP_VERSION, app, goalForDate, navigate, refreshApp } from '../main.js';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS, MANUAL_ISSUE_TEXT, MIN_KCAL, checkManualGoals, kcalFromMacros } from '../lib/calc.js';
import { parseDecimal, todayISO } from '../lib/dates.js';
import { buildICS, mealsToCSV, validateBackup, waterToCSV, weightsToCSV } from '../lib/export.js';
import { button, clear, confirmDialog, field, fmt, h, icon, isNativeApp, notice, numberInput, pickFile, saveFile, toast } from '../ui.js';
import { installApp, isStandalone } from '../install.js';

export async function render(view) {
  const today = todayISO();
  const goal = goalForDate(today) ?? { kcal: 2000, protein_g: 100, carbs_g: 250, fat_g: 65, water_ml: 2000, isManual: false };
  const p = app.profile;
  const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;

  view.append(h('header', { class: 'topbar' }, h('span', { class: 'topbar-spacer' }), h('h1', null, 'Einstellungen'), h('span', { class: 'topbar-spacer' })));

  // ───────────── Ziele ─────────────
  const goalBox = h('div');
  const showGoal = () => {
    clear(goalBox).append(
      h('div', { class: 'goal-summary' },
        h('div', null, h('strong', { class: 'big' }, `${fmt(goal.kcal)} kcal`), h('span', { class: 'muted small' }, goal.isManual ? 'manuell festgelegt' : 'berechnet')),
        h('p', { class: 'muted small' }, `${goal.protein_g} g Eiweiß · ${goal.carbs_g} g Kohlenhydrate · ${goal.fat_g} g Fett · ${String(goal.water_ml / 1000).replace('.', ',')} l Wasser`)),
      h('p', { class: 'muted small' },
        `${GOAL_OPTIONS.find((g) => g.value === p.goal)?.title ?? ''}${p.weeklyRateKg ? ` · ${String(p.weeklyRateKg).replace('.', ',')} kg/Woche` : ''} · ${ACTIVITY_OPTIONS.find((a) => a.value === p.activity)?.title ?? ''}`),
      h('div', { class: 'row' },
        button('Neu berechnen', () => navigate('onboarding?edit=1'), { variant: 'secondary', small: true, iconName: 'edit' }),
        button('Manuell anpassen', editGoal, { variant: 'ghost', small: true })),
    );
  };

  function editGoal() {
    const v = { kcal: goal.kcal, protein_g: goal.protein_g, carbs_g: goal.carbs_g, fat_g: goal.fat_g, water_ml: goal.water_ml };
    const errors = h('div');
    const inp = (key, suffix) => numberInput({ value: String(v[key]), suffix, decimals: false, onInput: (x) => { v[key] = Math.round(parseDecimal(x)); } });
    clear(goalBox).append(
      field('Kalorien', inp('kcal', 'kcal')),
      h('div', { class: 'grid-3' }, field('Eiweiß', inp('protein_g', 'g')), field('Kohlenh.', inp('carbs_g', 'g')), field('Fett', inp('fat_g', 'g'))),
      field('Wasser', inp('water_ml', 'ml')),
      errors,
      h('div', { class: 'row' },
        button('Abbrechen', showGoal, { variant: 'secondary', small: true }),
        button('Speichern', async () => {
          const issues = checkManualGoals(v.kcal, v, p.basis);
          const blocking = issues.filter((i) => i !== 'macro_mismatch');
          errors.replaceChildren(...issues.map((i) => notice(MANUAL_ISSUE_TEXT[i].replace('{min}', MIN_KCAL[p.basis]).replace('{macroKcal}', kcalFromMacros(v)), i === 'macro_mismatch' ? 'info' : 'error')));
          if (blocking.length) return;
          if (!(v.water_ml >= 500 && v.water_ml <= 6000)) { errors.append(notice('Wasser bitte zwischen 500 und 6000 ml.', 'error')); return; }
          if ([v.protein_g, v.carbs_g, v.fat_g].some((x) => !(x >= 0))) { errors.append(notice('Bitte alle Makros angeben.', 'error')); return; }
          await db.saveGoal({ validFrom: today, ...v, isManual: true });
          await refreshApp();
          toast('Ziele gespeichert', 'success');
          navigate('settings', { replace: true });
        }, { small: true })),
    );
  }

  // ───────────── Erinnerungen ─────────────
  const reminder = { breakfast: '08:00', lunch: '12:30', dinner: '18:30', weigh: true };
  const timeInput = (key, label) => field(label, h('input', { type: 'time', value: reminder[key], onchange: (e) => { reminder[key] = e.target.value; } }));
  const downloadReminders = () => {
    const events = [
      { title: 'Frühstück eintragen', time: reminder.breakfast, rrule: 'FREQ=DAILY' },
      { title: 'Mittagessen eintragen', time: reminder.lunch, rrule: 'FREQ=DAILY' },
      { title: 'Abendessen eintragen', time: reminder.dinner, rrule: 'FREQ=DAILY' },
    ].filter((e) => e.time);
    if (reminder.weigh) events.push({ title: 'Wiegen (nüchtern, nach dem Aufstehen)', time: '07:00', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    saveFile(buildICS(events, new Date()), 'kalorientracker-erinnerungen.ics', 'text/calendar');
  };

  // ───────────── Daten ─────────────
  const exportCSV = async (kind) => {
    if (kind === 'meals') saveFile(mealsToCSV(await db.allMeals()), `tagebuch-${today}.csv`, 'text/csv');
    if (kind === 'weights') saveFile(weightsToCSV(await db.allWeights()), `gewicht-${today}.csv`, 'text/csv');
    if (kind === 'water') saveFile(waterToCSV(await db.allWater()), `wasser-${today}.csv`, 'text/csv');
  };
  const exportBackup = async () => {
    const data = await db.exportAll();
    saveFile(JSON.stringify(data), `kalorientracker-backup-${today}.json`, 'application/json');
  };
  const importBackup = async () => {
    const file = await pickFile({ accept: 'application/json,.json' });
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('Die Datei ist kein gültiges Backup.', 'error'); return; }
    const err = validateBackup(data);
    if (err) { toast(err, 'error'); return; }
    const ok = await confirmDialog({ title: 'Backup einspielen?', text: 'Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.', confirmLabel: 'Ersetzen', danger: true });
    if (!ok) return;
    await db.importAll(data);
    await refreshApp();
    toast('Backup eingespielt', 'success');
    navigate('today', { replace: true });
  };
  const deleteAll = async () => {
    const ok = await confirmDialog({
      title: 'Alle Daten löschen?',
      text: 'Profil, Ziele, Tagebuch, Gewicht, Fotos und eigene Lebensmittel werden von diesem Gerät gelöscht. Tipp: vorher ein Backup machen.',
      confirmLabel: 'Endgültig löschen',
      danger: true,
    });
    if (!ok) return;
    await db.deleteEverything();
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* egal */ }
    if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('kt-data')) await caches.delete(k);
    location.replace(location.pathname);
  };

  const togglePhotos = async (e) => {
    app.prefs = await db.savePrefs({ storePhotos: e.target.checked });
    toast(e.target.checked ? 'Fotos werden ab jetzt gespeichert' : 'Neue Fotos werden nicht mehr gespeichert');
  };
  const removeStoredPhotos = async () => {
    const ok = await confirmDialog({ title: 'Gespeicherte Fotos löschen?', text: 'Die Mahlzeiten bleiben erhalten, nur die Vorschaubilder werden entfernt.', confirmLabel: 'Fotos löschen', danger: true });
    if (!ok) return;
    let n = 0;
    for (const m of await db.allMeals()) if (m.photo) { await db.saveMeal({ ...m, photo: null }); n++; }
    toast(`${n} Fotos gelöscht`);
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const native = isNativeApp();
  const isAndroid = /Android/i.test(navigator.userAgent);
  const standalone = isStandalone();

  view.append(
    section('Ziele', 'scale', goalBox),
    section('Fotos', 'camera',
      h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: app.prefs.storePhotos, onchange: togglePhotos }),
        h('span', null, 'Vorschaubilder der Essensfotos im Tagebuch speichern (nur auf diesem Gerät)')),
      button('Gespeicherte Fotos löschen', removeStoredPhotos, { variant: 'ghost', small: true, iconName: 'trash' }),
      button('Foto-Gedächtnis zurücksetzen', async () => {
        if (!(await confirmDialog({ title: 'Foto-Gedächtnis zurücksetzen?', text: 'Die App vergisst, welche Fotos zu welchen Einträgen gehörten. Deine Mahlzeiten bleiben erhalten.', confirmLabel: 'Zurücksetzen', danger: true }))) return;
        for (const e of await db.allPhotoMemory()) await db.deletePhotoMemory(e.id);
        toast('Foto-Gedächtnis zurückgesetzt');
      }, { variant: 'ghost', small: true })),
    section('Erinnerungen', 'bell',
      h('p', { class: 'muted small' }, 'Web-Apps können ohne Server keine verlässlichen Push-Nachrichten schicken. Daher erstellt die App wiederkehrende Termine für deinen Handy-Kalender – der erinnert dich dann zuverlässig.'),
      h('div', { class: 'grid-3' }, timeInput('breakfast', 'Frühstück'), timeInput('lunch', 'Mittag'), timeInput('dinner', 'Abend')),
      h('label', { class: 'toggle-row' }, h('input', { type: 'checkbox', checked: reminder.weigh, onchange: (e) => { reminder.weigh = e.target.checked; } }),
        h('span', null, 'Jeden Montag um 7:00 ans Wiegen erinnern')),
      button('Zum Kalender hinzufügen', downloadReminders, { variant: 'secondary', iconName: 'download' })),
    !standalone
      ? section('Als App installieren', 'download',
        h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, 'Installiert den Kalorientracker wie eine normale App auf deinem Startbildschirm – ohne Browserleiste und auch offline.'),
          button('App installieren', installApp, { iconName: 'download' }),
          isAndroid
            ? h('details', null,
              h('summary', null, 'Alternative: Android-App als Datei (APK)'),
              h('p', { class: 'muted small' }, 'Falls die Installation über Chrome nicht klappt: APK herunterladen und öffnen. Android fragt dann, ob du Apps aus dieser Quelle erlauben willst. Daten nimmst du per Backup mit.'),
              h('a', { class: 'btn btn-secondary btn-small', href: 'https://github.com/FlorianHess77/kalorientracker/releases/latest/download/kalorientracker.apk' }, icon('download', 18), h('span', null, 'APK herunterladen')))
            : null))
      : null,
    section('Daten', 'download',
      !persisted ? notice('Der Browser darf die Daten bei Speichermangel löschen. Installiere die App auf dem Startbildschirm und mache ab und zu ein Backup.', 'info') : null,
      h('div', { class: 'button-list' },
        button('Tagebuch als CSV', () => exportCSV('meals'), { variant: 'secondary', iconName: 'download', small: true }),
        button('Gewicht als CSV', () => exportCSV('weights'), { variant: 'secondary', iconName: 'download', small: true }),
        button('Wasser als CSV', () => exportCSV('water'), { variant: 'secondary', iconName: 'download', small: true }),
        button('Backup speichern', exportBackup, { variant: 'secondary', iconName: 'download', small: true }),
        button('Backup einspielen', importBackup, { variant: 'secondary', iconName: 'upload', small: true })),
      h('p', { class: 'muted small' }, 'Das Backup enthält alles außer den Fotos. So nimmst du deine Daten auf ein neues Handy mit.'),
      button('Alle Daten löschen', deleteAll, { variant: 'danger', iconName: 'trash' })),
    section('Info & Datenschutz', 'info',
      h('ul', { class: 'info-list' },
        h('li', null, 'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Es gibt keinen Server und kein Konto.'),
        h('li', null, 'Die Foto-Erkennung läuft lokal (Google AIY Food Classifier mit TensorFlow Lite). Fotos werden nicht hochgeladen.'),
        h('li', null, 'Damit die App wiederkehrende Gerichte erkennt, merkt sie sich zu bestätigten Fotos einen Erkennungs-Fingerabdruck (eine Liste von Wahrscheinlichkeiten, kein Bild) und deine Einträge.'),
        h('li', null, 'Bei Barcode und Produktsuche wird nur der Barcode bzw. Suchbegriff an Open Food Facts gesendet. Produktdaten: © Open Food Facts, Lizenz ODbL.'),
        h('li', null, 'Kalorien- und Nährwertangaben sind Schätzungen. Die App ersetzt keine medizinische oder ernährungstherapeutische Beratung.')),
      h('p', { class: 'muted small center' }, `Version ${APP_VERSION}`),
      h('details', { class: 'diagnose' },
        h('summary', null, 'Technische Diagnose'),
        h('p', { class: 'muted small' }, 'Falls die Foto-Erkennung nicht klappt: einmal ein Foto versuchen, dann hier „Anzeigen“ tippen und den Text kopieren.'),
        h('div', { class: 'row' },
          button('Anzeigen', async (e) => {
            const { getDiagnostics, warmUp } = await import('../recognition/recognizer.js');
            await warmUp().catch(() => {});
            const { lastSearchProblems } = await import('../off.js');
            const { photoState } = await import('../photo-flow.js');
            const text = JSON.stringify({ version: APP_VERSION, lowMemory: Boolean(app.prefs.lowMemory), lastPhoto: photoState(), ...(await getDiagnostics()), searchProblems: lastSearchProblems }, null, 2);
            const pre = e.target.closest('details').querySelector('pre');
            pre.textContent = text;
            pre.hidden = false;
          }, { variant: 'secondary', small: true }),
          button('Kopieren', async (e) => {
            const pre = e.target.closest('details').querySelector('pre');
            try { await navigator.clipboard.writeText(pre.textContent); toast('Kopiert'); } catch { toast('Bitte den Text markieren und kopieren.'); }
          }, { variant: 'ghost', small: true })),
        h('pre', { class: 'diag-text', hidden: true }))),
  );
  showGoal();
}

function section(title, iconName, ...children) {
  return h('section', { class: 'card settings-section' }, h('h2', null, icon(iconName, 20), title), ...children);
}
