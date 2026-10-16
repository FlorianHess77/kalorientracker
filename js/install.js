/** "App installieren" wie bei der Garage-App: Chrome installiert die Web-App als echte App (ohne Browserleiste). */

import { app } from './main.js';
import { button, confirmDialog, h, icon, isNativeApp } from './ui.js';

const HIDE_KEY = 'kt.installHide';

export function isStandalone() {
  return isNativeApp()
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true
    || document.referrer.startsWith('android-app://');
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Installation starten: direkt über Chrome, sonst kurze Anleitung */
export async function installApp() {
  if (app.installPrompt) {
    const evt = app.installPrompt;
    app.installPrompt = null;
    evt.prompt();
    await evt.userChoice.catch(() => null);
    return;
  }
  await confirmDialog({
    title: 'App installieren',
    text: isIOS()
      ? 'In Safari unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen. Danach startet der Kalorientracker wie eine normale App.'
      : 'In Chrome rechts oben auf ⋮ tippen und „App installieren“ (oder „Zum Startbildschirm hinzufügen“) wählen. Danach startet der Kalorientracker vom Startbildschirm wie eine normale App – ohne Browserleiste und auch offline.',
    confirmLabel: 'Verstanden',
    cancelLabel: 'Schließen',
  });
}

/** Hinweis-Banner für die Startseite (nur im Browser) */
export function installBanner() {
  if (isStandalone() || !/^https?:/.test(location.protocol)) return null;
  try { if (localStorage.getItem(HIDE_KEY)) return null; } catch { /* egal */ }
  const banner = h('div', { class: 'install-banner' },
    h('span', { class: 'install-icon' }, icon('download', 22)),
    h('div', { class: 'list-text' }, h('strong', null, 'App installieren'), h('span', { class: 'muted small' }, 'Wie eine normale App, auch offline.')),
    button('Installieren', installApp, { small: true }),
    h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'Ausblenden',
      onclick: () => { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* egal */ } banner.remove(); },
    }, icon('close', 18)));
  return banner;
}

window.addEventListener('appinstalled', () => {
  document.querySelector('.install-banner')?.remove();
});
