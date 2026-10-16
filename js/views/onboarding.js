/** Onboarding: Einwilligung → Körperdaten → Aktivität → Ziel → Ergebnis (anpassbar). */

import * as db from '../db.js';
import { app, navigate, refreshApp } from '../main.js';
import {
  ACTIVITY_OPTIONS, GOAL_OPTIONS, MANUAL_ISSUE_TEXT, MAX_AGE, MIN_AGE, MIN_KCAL, RATE_OPTIONS, WARNING_TEXT,
  ageOn, calculateGoals, canChooseLose, checkManualGoals, kcalFromMacros,
} from '../lib/calc.js';
import { formatNumber, fromISODate, parseDecimal, toISODate, todayISO } from '../lib/dates.js';
import { button, clear, field, h, icon, notice, numberInput, optionCard, toast } from '../ui.js';

const CONSENT_VERSION = '1';

export async function render(view, params) {
  const editing = Boolean(params.edit && app.profile?.onboardedAt);
  const lastWeight = (await db.allWeights()).at(-1);
  const p = app.profile ?? {};

  const s = {
    step: editing ? 1 : 0,
    consent: editing,
    storePhotos: app.prefs.storePhotos,
    sex: p.sex ?? null,
    basis: p.basis ?? null,
    birthDate: p.birthDate ?? '',
    height: p.heightCm ? formatNumber(p.heightCm) : '',
    weight: lastWeight ? formatNumber(lastWeight.kg, 1).replace(/,0$/, '') : '',
    activity: p.activity ?? null,
    goal: p.goal ?? null,
    rate: p.weeklyRateKg || 0.5,
    manual: false,
    manualValues: null,
    errors: {},
  };

  const today = new Date();
  const maxBirth = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  const minBirth = new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate());

  const weightKg = () => parseDecimal(s.weight);
  const heightCm = () => parseDecimal(s.height);
  const basis = () => (s.sex === 'diverse' ? s.basis : s.sex);
  const age = () => ageOn(fromISODate(s.birthDate), today);

  function goals() {
    return calculateGoals({
      basis: basis(), weightKg: weightKg(), heightCm: heightCm(), age: age(),
      activity: s.activity, goal: s.goal, weeklyRateKg: s.goal === 'maintain' ? 0 : s.rate,
    });
  }

  const STEPS = [stepWelcome, stepBody, stepActivity, stepGoal, stepResult];

  function draw() {
    clear(view);
    const total = STEPS.length - 1;
    view.append(
      h('div', { class: 'onboarding' },
        s.step > 0 ? h('div', { class: 'steps', 'aria-label': `Schritt ${s.step} von ${total}` },
          Array.from({ length: total }, (_, i) => h('span', { class: i < s.step ? 'done' : '' }))) : null,
        STEPS[s.step]()),
    );
    view.querySelector('h1')?.focus?.();
  }

  const go = (step) => { s.errors = {}; s.step = step; draw(); window.scrollTo(0, 0); };

  function footer(onNext, { nextLabel = 'Weiter', disabled = false } = {}) {
    return h('div', { class: 'sticky-actions' },
      s.step > (editing ? 1 : 0) ? button('Zurück', () => go(s.step - 1), { variant: 'secondary' })
        : editing ? button('Abbrechen', () => navigate('settings'), { variant: 'secondary' }) : null,
      button(nextLabel, onNext, { disabled, block: true }));
  }

  // ───────────── Schritt 0: Willkommen & Einwilligung ─────────────
  function stepWelcome() {
    return h('section', null,
      h('div', { class: 'hero' }, h('div', { class: 'hero-icon' }, icon('camera', 40)),
        h('h1', { tabindex: '-1' }, 'Willkommen!'),
        h('p', { class: 'lead' }, 'Fotografiere dein Essen, scanne Barcodes oder suche Lebensmittel – die App zählt Kalorien und Makros für dich.')),
      h('ul', { class: 'checklist' },
        h('li', null, icon('check', 18), 'Deine Daten bleiben auf diesem Gerät. Es gibt kein Konto und keinen Server.'),
        h('li', null, icon('check', 18), 'Die Foto-Erkennung läuft direkt im Browser, Fotos werden nirgends hochgeladen.'),
        h('li', null, icon('check', 18), 'Für Barcode und Produktsuche wird nur der Suchbegriff an Open Food Facts gesendet.')),
      h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: s.consent, onchange: (e) => { s.consent = e.target.checked; draw(); } }),
        h('span', null, h('strong', null, 'Einwilligung (erforderlich): '),
          'Ich willige ein, dass meine Gesundheitsdaten (z. B. Gewicht, Größe, Ernährung) auf diesem Gerät gespeichert und zur Berechnung meiner Ziele verwendet werden. Ich kann sie jederzeit in den Einstellungen exportieren oder löschen.')),
      h('label', { class: 'toggle-row' },
        h('input', { type: 'checkbox', checked: s.storePhotos, onchange: (e) => { s.storePhotos = e.target.checked; } }),
        h('span', null, h('strong', null, 'Fotos speichern (optional): '), 'Eine kleine Vorschau deiner Essensfotos im Tagebuch behalten.')),
      h('p', { class: 'muted small' }, 'Die App ist für Erwachsene gedacht und ersetzt keine medizinische oder ernährungstherapeutische Beratung.'),
      footer(() => go(1), { nextLabel: 'Los geht\'s', disabled: !s.consent }),
    );
  }

  // ───────────── Schritt 1: Körperdaten ─────────────
  function stepBody() {
    const err = (k) => (s.errors[k] ? h('span', { class: 'field-error' }, s.errors[k]) : null);
    const sexOptions = [['female', 'Weiblich'], ['male', 'Männlich'], ['diverse', 'Divers']];
    return h('section', null,
      h('h1', { tabindex: '-1' }, 'Über dich'),
      h('p', { class: 'muted' }, 'Daraus berechnen wir deinen Kalorienbedarf.'),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Geschlecht'),
        h('div', { class: 'chips' }, sexOptions.map(([v, label]) =>
          h('button', { type: 'button', class: ['chip', s.sex === v && 'active'], onclick: () => { s.sex = v; draw(); } }, label))),
        err('sex')),
      s.sex === 'diverse'
        ? h('div', { class: 'field' },
          h('span', { class: 'field-label' }, 'Berechnungsgrundlage'),
          h('span', { class: 'field-hint' }, 'Die verwendete Formel (Mifflin-St Jeor) gibt es nur in einer Variante für Männer und einer für Frauen. Wähle, was für deinen Körper besser passt.'),
          h('div', { class: 'chips' }, [['female', 'Wie für Frauen'], ['male', 'Wie für Männer']].map(([v, label]) =>
            h('button', { type: 'button', class: ['chip', s.basis === v && 'active'], onclick: () => { s.basis = v; draw(); } }, label))),
          err('basis'))
        : null,
      field('Geburtsdatum', h('input', {
        type: 'date', value: s.birthDate, max: toISODate(maxBirth), min: toISODate(minBirth),
        onchange: (e) => { s.birthDate = e.target.value; },
      })),
      err('birthDate'),
      field('Größe', numberInput({ value: s.height, suffix: 'cm', decimals: false, placeholder: 'z. B. 175', onInput: (v) => { s.height = v; } })),
      err('height'),
      field('Aktuelles Gewicht', numberInput({ value: s.weight, suffix: 'kg', placeholder: 'z. B. 72,5', onInput: (v) => { s.weight = v; } })),
      err('weight'),
      footer(() => {
        const e = {};
        if (!s.sex) e.sex = 'Bitte auswählen.';
        if (s.sex === 'diverse' && !s.basis) e.basis = 'Bitte eine Grundlage wählen.';
        if (!s.birthDate) e.birthDate = 'Bitte Geburtsdatum angeben.';
        else {
          const a = age();
          if (!(a >= MIN_AGE)) e.birthDate = `Die App ist für Erwachsene ab ${MIN_AGE} Jahren gedacht.`;
          else if (a > MAX_AGE) e.birthDate = 'Bitte ein gültiges Geburtsdatum angeben.';
        }
        if (!(heightCm() >= 120 && heightCm() <= 230)) e.height = 'Bitte eine Größe zwischen 120 und 230 cm angeben.';
        if (!(weightKg() >= 35 && weightKg() <= 300)) e.weight = 'Bitte ein Gewicht zwischen 35 und 300 kg angeben.';
        s.errors = e;
        if (Object.keys(e).length) draw();
        else go(2);
      }),
    );
  }

  // ───────────── Schritt 2: Aktivität ─────────────
  function stepActivity() {
    return h('section', null,
      h('h1', { tabindex: '-1' }, 'Wie aktiv bist du?'),
      h('p', { class: 'muted' }, 'Denk an eine normale Woche – lieber etwas vorsichtiger schätzen.'),
      h('div', { class: 'options' }, ACTIVITY_OPTIONS.map((o) =>
        optionCard({ title: o.title, description: o.description, selected: s.activity === o.value, onClick: () => { s.activity = o.value; draw(); } }))),
      footer(() => go(3), { disabled: !s.activity }),
    );
  }

  // ───────────── Schritt 3: Ziel & Tempo ─────────────
  function stepGoal() {
    const loseAllowed = canChooseLose(weightKg(), heightCm());
    if (!loseAllowed && s.goal === 'lose') s.goal = null;
    const rates = s.goal && s.goal !== 'maintain' ? RATE_OPTIONS[s.goal] : [];
    if (rates.length && !rates.some((r) => r.value === s.rate)) s.rate = rates[s.goal === 'lose' ? 1 : 0].value;
    return h('section', null,
      h('h1', { tabindex: '-1' }, 'Was ist dein Ziel?'),
      h('div', { class: 'options' }, GOAL_OPTIONS.map((o) =>
        optionCard({
          title: o.title,
          description: o.value === 'lose' && !loseAllowed ? 'Bei Untergewicht nicht verfügbar' : o.description,
          selected: s.goal === o.value,
          disabled: o.value === 'lose' && !loseAllowed,
          onClick: () => { s.goal = o.value; draw(); },
        }))),
      !loseAllowed ? notice(WARNING_TEXT.underweight_no_loss, 'info') : null,
      rates.length
        ? h('div', { class: 'field' },
          h('span', { class: 'field-label' }, s.goal === 'lose' ? 'Wie schnell abnehmen?' : 'Wie schnell zunehmen?'),
          h('div', { class: 'options' }, rates.map((r) =>
            optionCard({
              title: `${String(r.value).replace('.', ',')} kg pro Woche`,
              description: r.label,
              selected: s.rate === r.value,
              onClick: () => { s.rate = r.value; draw(); },
            }))))
        : null,
      footer(() => { s.manual = false; s.manualValues = null; go(4); }, { disabled: !s.goal, nextLabel: 'Ziel berechnen' }),
    );
  }

  // ───────────── Schritt 4: Ergebnis ─────────────
  function stepResult() {
    const g = goals();
    const values = s.manualValues ?? { kcal: g.kcal, protein_g: g.protein_g, carbs_g: g.carbs_g, fat_g: g.fat_g, water_ml: g.water_ml };
    const b = basis();

    const issues = s.manual ? checkManualGoals(values.kcal, values, b) : [];
    const blocking = issues.includes('below_minimum') || issues.includes('too_high');

    const manualInput = (key, suffix) => numberInput({
      value: String(values[key] ?? ''), suffix, decimals: false,
      onInput: (v) => { s.manualValues = { ...values, [key]: Math.round(parseDecimal(v)) }; },
    });

    return h('section', null,
      h('h1', { tabindex: '-1' }, 'Dein Tagesziel'),
      h('div', { class: 'card result-card' },
        h('div', { class: 'big-number' }, formatNumber(values.kcal), h('span', null, ' kcal')),
        h('p', { class: 'muted' }, s.manual ? 'Manuell angepasst' :
          `Grundumsatz ${g.bmr} kcal · Gesamtbedarf ${g.tdee} kcal${g.dailyDelta ? ` · ${g.dailyDelta > 0 ? '+' : ''}${g.dailyDelta} kcal/Tag` : ''}`),
        h('div', { class: 'macro-grid' },
          macroBox('Eiweiß', values.protein_g, 'var(--protein)'),
          macroBox('Kohlenhydrate', values.carbs_g, 'var(--carbs)'),
          macroBox('Fett', values.fat_g, 'var(--fat)')),
        h('p', { class: 'muted small' }, `Wasser: ${String(values.water_ml / 1000).replace('.', ',')} Liter pro Tag`)),
      ...g.warnings.filter(() => !s.manual).map((w) => notice(WARNING_TEXT[w], w === 'aggressive_rate' ? 'warning' : 'info')),
      s.manual
        ? h('div', { class: 'card' },
          h('h2', null, 'Ziele anpassen'),
          field('Kalorien', manualInput('kcal', 'kcal')),
          h('div', { class: 'grid-3' },
            field('Eiweiß', manualInput('protein_g', 'g')),
            field('Kohlenh.', manualInput('carbs_g', 'g')),
            field('Fett', manualInput('fat_g', 'g'))),
          field('Wasser', manualInput('water_ml', 'ml')),
          issues.map((i) => notice(MANUAL_ISSUE_TEXT[i].replace('{min}', MIN_KCAL[b]).replace('{macroKcal}', kcalFromMacros(values)), i === 'macro_mismatch' ? 'info' : 'error')),
          h('div', { class: 'row' },
            button('Prüfen', () => draw(), { variant: 'secondary', small: true }),
            button('Berechnete Werte', () => { s.manual = false; s.manualValues = null; draw(); }, { variant: 'ghost', small: true })))
        : button('Ziele selbst anpassen', () => { s.manual = true; s.manualValues = values; draw(); }, { variant: 'ghost', iconName: 'edit' }),
      h('p', { class: 'muted small' }, 'Alle Werte sind Schätzungen auf Basis wissenschaftlicher Formeln und ersetzen keine ärztliche Beratung. Du kannst sie jederzeit in den Einstellungen ändern.'),
      footer(async () => {
        if (s.manual) {
          const current = checkManualGoals(values.kcal, values, b);
          if (current.includes('below_minimum') || current.includes('too_high')) { draw(); return; }
          if (!(values.water_ml >= 500 && values.water_ml <= 6000)) { toast('Bitte beim Wasser 500–6000 ml angeben.', 'error'); return; }
        }
        await finish(g, values);
      }, { nextLabel: editing ? 'Speichern' : 'Fertig', disabled: blocking }),
    );
  }

  function macroBox(label, grams, color) {
    return h('div', { class: 'macro-box' }, h('span', { class: 'dot', style: { background: color } }), h('strong', null, `${grams} g`), h('span', null, label));
  }

  async function finish(g, values) {
    const now = new Date().toISOString();
    const date = todayISO();
    try {
      await db.saveProfile({
        sex: s.sex,
        basis: basis(),
        birthDate: s.birthDate,
        heightCm: heightCm(),
        activity: s.activity,
        goal: g.effectiveGoal,
        weeklyRateKg: g.effectiveGoal === 'maintain' ? 0 : s.rate,
        consentAt: app.profile?.consentAt ?? now,
        consentVersion: CONSENT_VERSION,
        onboardedAt: app.profile?.onboardedAt ?? now,
      });
      if (!editing) await db.savePrefs({ storePhotos: s.storePhotos });
      await db.saveGoal({ validFrom: date, ...values, isManual: s.manual });
      await db.setWeight(date, Math.round(weightKg() * 10) / 10);
      if (!editing) db.requestPersistentStorage();
      await refreshApp();
      toast(editing ? 'Ziele aktualisiert' : 'Alles bereit – guten Appetit!', 'success');
      navigate(editing ? 'settings' : 'today', { replace: true });
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${e.message}`, 'error');
    }
  }

  draw();
}
