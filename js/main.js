/** Einstieg: App-Zustand, Router (Hash-basiert, funktioniert auch auf GitHub Pages) und Tab-Leiste. */

import * as db from './db.js';
import { mealTypeForTime, todayISO } from './lib/dates.js';
import { releaseBlobUrls } from './lib/image.js';
import { clearDraft, setCaptureContext } from './draft.js';
import { clear, h, icon, notice, toast } from './ui.js';

export const APP_VERSION = '1.5.2';

export const app = {
  profile: null,
  prefs: db.DEFAULT_PREFS,
  goals: [],
  viewDate: todayISO(),
  installPrompt: null,
};

export async function refreshApp() {
  const [profile, prefs, goals] = await Promise.all([db.getProfile(), db.getPrefs(), db.getGoals()]);
  Object.assign(app, { profile, prefs, goals });
}

export const goalForDate = (date) => db.goalFor(app.goals, date);

const ROUTES = {
  onboarding: () => import('./views/onboarding.js'),
  today: () => import('./views/today.js'),
  capture: () => import('./views/capture.js'),
  camera: () => import('./views/camera.js'),
  review: () => import('./views/review.js'),
  search: () => import('./views/search.js'),
  food: () => import('./views/food.js'),
  manual: () => import('./views/manual.js'),
  barcode: () => import('./views/barcode.js'),
  meal: () => import('./views/meal.js'),
  progress: () => import('./views/progress.js'),
  settings: () => import('./views/settings.js'),
};
const TAB_ROUTES = new Set(['today', 'progress', 'settings']);

export function parseRoute() {
  const raw = decodeURI(location.hash.replace(/^#\/?/, ''));
  const [name, query] = raw.split('?');
  return { name: name || 'today', params: Object.fromEntries(new URLSearchParams(query || '')) };
}

/** navigate('review') oder navigate('today?date=2026-10-16', { replace: true }) */
export function navigate(path, { replace = false } = {}) {
  const url = `#/${path.replace(/^#?\/?/, '')}`;
  if (replace) {
    history.replaceState(null, '', url);
    render();
  } else if (location.hash === url) {
    render();
  } else {
    location.hash = url;
  }
}

export const goBack = (fallback = 'today') => {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
};

let cleanup = null;
let renderSeq = 0;

export async function render() {
  const seq = ++renderSeq;
  const { name, params } = parseRoute();

  if (!app.profile?.onboardedAt && name !== 'onboarding') return navigate('onboarding', { replace: true });
  if (app.profile?.onboardedAt && name === 'onboarding' && !params.edit) return navigate('today', { replace: true });

  const load = ROUTES[name];
  if (!load) return navigate('today', { replace: true });

  const mod = await load();
  if (seq !== renderSeq) return;

  try { cleanup?.(); } catch { /* ignorieren */ }
  cleanup = null;
  releaseBlobUrls();

  const root = clear(document.getElementById('app'));
  const view = h('main', { class: `view view-${name}`, id: 'main' });
  root.append(view);
  if (TAB_ROUTES.has(name)) root.append(tabBar(name));
  root.classList.toggle('has-tabs', TAB_ROUTES.has(name));

  try {
    const result = await mod.render(view, params);
    if (seq !== renderSeq) { result?.(); return; }
    cleanup = typeof result === 'function' ? result : null;
  } catch (e) {
    console.error(e);
    view.append(notice(`Da ist etwas schiefgelaufen: ${e.message}`, 'error'));
  }
  if (!params.keepScroll) window.scrollTo(0, 0);
}

/** Aktuelle Ansicht neu zeichnen (z. B. nach dem Speichern) */
export const rerender = () => render();

function tabBar(active) {
  const tab = (name, label, iconName) =>
    h('a', { href: `#/${name}`, class: ['tab', active === name && 'active'], 'aria-current': active === name ? 'page' : null }, icon(iconName), h('span', null, label));
  return h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Hauptnavigation' },
    tab('today', 'Heute', 'home'),
    tab('progress', 'Fortschritt', 'chart'),
    h('button', {
      type: 'button',
      class: 'tab-camera',
      'aria-label': 'Essen erfassen',
      onclick: () => navigate(`camera?date=${app.viewDate}&meal=${mealTypeForTime()}`),
    }, icon('camera', 28)),
    h('button', {
      type: 'button',
      class: 'tab',
      onclick: () => {
        clearDraft();
        setCaptureContext({ date: app.viewDate, mealType: mealTypeForTime() });
        navigate('search');
      },
    }, icon('search'), h('span', null, 'Suchen')),
    tab('settings', 'Profil', 'settings'),
  );
}

async function boot() {
  try {
    await refreshApp();
  } catch (e) {
    clear(document.getElementById('app')).append(
      h('main', { class: 'view' }, notice(`Der lokale Speicher ist nicht verfügbar (${e.message}). Im privaten Modus mancher Browser funktioniert die App nicht.`, 'error')),
    );
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason?.name === 'QuotaExceededError') {
      toast('Der Speicher des Browsers ist voll. Bitte „Fotos speichern“ abschalten oder ein Backup machen und alte Daten löschen.', 'error');
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    app.installPrompt = e;
  });
  await render();
  import('./photo-flow.js').then((m) => m.checkInterruptedPhoto()).catch(() => {});

  // In der Android-App liegen alle Dateien schon im Paket – dort kein Service Worker nötig
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !globalThis.Capacitor?.isNativePlatform?.()) {
    // Kein automatisches Neuladen bei Updates (würde z. B. eine laufende Foto-Auswertung abbrechen).
    // Neue Dateien kommen trotzdem sofort: der Service Worker lädt immer zuerst aus dem Netz.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch((e) => console.warn('Service Worker nicht registriert:', e));
  }
}

boot();
