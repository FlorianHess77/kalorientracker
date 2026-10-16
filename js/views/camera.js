/**
 * Eingebaute Kamera: Das Foto wird direkt in der App aufgenommen. So muss Android nicht in die
 * Kamera-App wechseln – dabei wird die App bei wenig Speicher sonst oft beendet und das Foto geht verloren.
 */

import { app, goBack, navigate } from '../main.js';
import { MEAL_TYPES, isValidISODate, mealTypeForTime, todayISO } from '../lib/dates.js';
import { analyzePhoto } from '../photo-flow.js';
import { warmUp } from '../recognition/recognizer.js';
import { warmUpClip } from '../recognition/clip.js';
import { setCaptureContext } from '../draft.js';
import { button, h, icon, iconButton, pickFile } from '../ui.js';

export async function render(view, params) {
  const date = isValidISODate(params.date) ? params.date : app.viewDate ?? todayISO();
  const mealType = MEAL_TYPES.some((m) => m.value === params.meal) ? params.meal : mealTypeForTime();
  const ctx = { date, mealType };
  setCaptureContext(ctx);
  warmUp().catch(() => {});
  warmUpClip().catch(() => {});

  let stream = null;
  let torchOn = false;
  let stopped = false;

  const video = h('video', { class: 'camera-video', playsinline: true, muted: true, autoplay: true });
  const status = h('div', { class: 'camera-status', 'aria-live': 'polite' }, 'Kamera wird gestartet …');
  const torchBtn = iconButton('bolt', toggleTorch, 'Licht', 'camera-torch');
  torchBtn.hidden = true;
  const shutter = h('button', { type: 'button', class: 'shutter', 'aria-label': 'Foto aufnehmen', disabled: true, onclick: shoot });

  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  async function fromGallery() {
    const file = await pickFile({ accept: 'image/*' });
    if (!file) return;
    stop();
    const ok = await analyzePhoto(file, ctx);
    if (!ok) navigate(`camera?date=${date}&meal=${mealType}`, { replace: true });
  }

  async function shoot() {
    if (!stream || !video.videoWidth) return;
    shutter.disabled = true;
    // Standbild in Originalgröße (die Auswertung verkleinert selbst)
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    navigator.vibrate?.(30);
    stop();
    const ok = await analyzePhoto(canvas, ctx);
    if (!ok) navigate(`camera?date=${date}&meal=${mealType}`, { replace: true });
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      torchBtn.classList.toggle('on', torchOn);
    } catch { torchOn = false; }
  }

  view.append(
    h('div', { class: 'camera' },
      h('div', { class: 'camera-top' },
        iconButton('close', () => { stop(); goBack(`capture?date=${date}&meal=${mealType}`); }, 'Schließen', 'camera-btn'),
        h('span', { class: 'camera-hint' }, 'Teller von oben, gut beleuchtet'),
        torchBtn),
      h('div', { class: 'camera-frame' }, video, h('div', { class: 'camera-guide' }), status),
      h('div', { class: 'camera-controls' },
        h('button', { type: 'button', class: 'camera-side', onclick: fromGallery, 'aria-label': 'Aus Galerie wählen' }, icon('image', 24), h('span', null, 'Galerie')),
        shutter,
        h('button', { type: 'button', class: 'camera-side', onclick: () => { stop(); navigate(`capture?date=${date}&meal=${mealType}`, { replace: true }); }, 'aria-label': 'Andere Erfassung' }, icon('search', 24), h('span', null, 'Suche & mehr')))),
  );

  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error('nicht unterstützt');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return stop; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    status.textContent = '';
    shutter.disabled = false;
    const caps = stream.getVideoTracks()[0]?.getCapabilities?.() ?? {};
    torchBtn.hidden = !caps.torch;
  } catch (e) {
    status.replaceChildren(
      h('p', null, e?.name === 'NotAllowedError'
        ? 'Kamerazugriff wurde nicht erlaubt. Du kannst ihn in den Einstellungen des Handys erlauben oder ein Foto aus der Galerie wählen.'
        : 'Die eingebaute Kamera ist hier nicht verfügbar.'),
      h('div', { class: 'row center-row' },
        button('Galerie', fromGallery, { iconName: 'image', small: true }),
        button('Kamera-App', async () => {
          const file = await pickFile({ accept: 'image/*', capture: 'environment' });
          if (file) await analyzePhoto(file, ctx);
        }, { variant: 'secondary', iconName: 'camera', small: true })),
    );
  }

  return stop;
}
