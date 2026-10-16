/**
 * Barcode-Scanner. Nutzt den eingebauten BarcodeDetector (Chrome/Android) und sonst ZXing.
 * Eingabe von Hand ist immer möglich.
 */

import * as db from '../db.js';
import { navigate, goBack } from '../main.js';
import { OffError, fetchProductByBarcode } from '../off.js';
import { setPendingFood } from '../draft.js';
import { button, h, header, notice, toast } from '../ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_LOCAL = new URL('../../vendor/zxing/zxing.min.js', import.meta.url).href;
const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

export async function render(view) {
  let stopped = false;
  let stream = null;
  let zxingReader = null;
  let loopTimer = null;
  let looking = false;

  const video = h('video', { class: 'scanner-video', playsinline: true, muted: true, autoplay: true });
  const status = h('div', { class: 'scanner-status', 'aria-live': 'polite' }, 'Kamera wird gestartet …');
  const resultBox = h('div');

  const manualInput = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'z. B. 9001234567890', 'aria-label': 'Barcode-Nummer', autocomplete: 'off' });

  view.append(
    header('Barcode scannen', { back: () => goBack() }),
    h('div', { class: 'scanner' }, video, h('div', { class: 'scanner-frame' }), status),
    resultBox,
    h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); lookup(manualInput.value); } },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Oder Nummer eintippen'), manualInput),
      button('Suchen', null, { type: 'submit', variant: 'secondary', iconName: 'search' })),
  );

  function stopCamera() {
    stopped = true;
    clearTimeout(loopTimer);
    try { zxingReader?.reset(); } catch { /* egal */ }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function lookup(raw) {
    const code = String(raw || '').replace(/\D/g, '');
    if (code.length < 6) { toast('Bitte einen gültigen Barcode eingeben.'); return; }
    if (looking) return;
    looking = true;
    stopCamera();
    status.textContent = `Barcode ${code} – suche Produkt …`;
    resultBox.replaceChildren();
    try {
      let food = await db.foodByBarcode(code);
      if (!food) {
        food = await fetchProductByBarcode(code);
        if (food?.per100g) await db.saveFood(food);
      }
      if (food?.per100g) {
        if (navigator.vibrate) navigator.vibrate(60);
        setPendingFood(food);
        navigate('food', { replace: true });
        return;
      }
      status.textContent = `Barcode ${code}`;
      resultBox.replaceChildren(
        notice(food ? `„${food.name}“ wurde gefunden, aber ohne vollständige Nährwerte.` : 'Dieses Produkt ist noch nicht in Open Food Facts.', 'info'),
        h('div', { class: 'row' },
          button('Selbst eintragen', () => navigate(`manual?barcode=${code}${food ? `&name=${encodeURIComponent(food.name)}` : ''}`, { replace: true }), { iconName: 'edit' }),
          button('Nochmal scannen', () => navigate('barcode', { replace: true }), { variant: 'secondary' })),
      );
    } catch (e) {
      status.textContent = 'Fehler';
      resultBox.replaceChildren(notice(e instanceof OffError ? e.message : 'Die Produktsuche hat nicht geklappt.', 'error'),
        button('Nochmal versuchen', () => navigate('barcode', { replace: true }), { variant: 'secondary' }));
    } finally {
      looking = false;
    }
  }

  async function startNative() {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats?.().catch(() => []) ?? [];
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return false;
    const detector = new globalThis.BarcodeDetector({ formats });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return true; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    status.textContent = 'Barcode in den Rahmen halten';
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes.length && !stopped) { lookup(codes[0].rawValue); return; }
        }
      } catch { /* einzelner Fehlversuch */ }
      loopTimer = setTimeout(tick, 200);
    };
    tick();
    return true;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(new Error(src)); };
      document.head.append(s);
    });
  }

  async function startZXing() {
    if (!globalThis.ZXing) {
      await loadScript(ZXING_LOCAL).catch(() => loadScript(ZXING_CDN));
    }
    if (stopped) return;
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = globalThis.ZXing;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    zxingReader = new BrowserMultiFormatReader(hints, 300);
    status.textContent = 'Barcode in den Rahmen halten';
    await zxingReader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      video,
      (result) => { if (result && !stopped) lookup(result.getText()); },
    );
  }

  (async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Kamera hier nicht verfügbar – bitte Nummer eintippen.';
      return;
    }
    try {
      const nativeOk = 'BarcodeDetector' in globalThis && (await startNative());
      if (!nativeOk && !stopped) await startZXing();
    } catch (e) {
      console.warn(e);
      if (stopped) return;
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Kamerazugriff wurde nicht erlaubt. Du kannst die Nummer eintippen.'
        : 'Scanner konnte nicht gestartet werden – bitte Nummer eintippen.';
    }
  })();

  return stopCamera;
}
