/** Bild-Helfer (Browser). */

/** Datei → ImageBitmap, mit korrekter Ausrichtung laut EXIF */
export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // ältere Browser: Fallback über <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

export const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

/** Mittig quadratisch zuschneiden und auf w×h skalieren */
export function squareCanvas(src, w, h) {
  const { w: sw, h: sh } = dims(src);
  const side = Math.min(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, w, h);
  return canvas;
}

/** Beliebigen quadratischen Ausschnitt (in Bildpixeln) auf w×h skalieren */
export function regionCanvas(src, sx, sy, size, w, h, flip = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  if (flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, size, size, 0, 0, w, h);
  return canvas;
}

/**
 * Ausschnitte für die Erkennung: [x, y, Größe, gespiegelt]
 * - ganzes Foto (normal und gespiegelt → stabilerer Gesamteindruck)
 * - Mitte (60 % und 40 % für kleine Portionen in der Tellermitte)
 * - vier überlappende Viertel (findet einzelne Komponenten auf gemischten Tellern)
 */
export function cropRegions(width, height) {
  const s = Math.min(width, height);
  const ox = (width - s) / 2;
  const oy = (height - s) / 2;
  const p = 0.6 * s;
  return [
    [ox, oy, s, false],
    [ox, oy, s, true],
    [ox + 0.2 * s, oy + 0.2 * s, p, false],
    [ox + 0.3 * s, oy + 0.3 * s, 0.4 * s, false],
    [ox, oy, p, false],
    [ox + 0.4 * s, oy, p, false],
    [ox, oy + 0.4 * s, p, false],
    [ox + 0.4 * s, oy + 0.4 * s, p, false],
  ];
}

/** Verkleinertes JPEG für die Foto-Vorschau im Tagebuch */
export async function makeThumbnail(src, maxSide = 480, quality = 0.72) {
  const { w, h } = dims(src);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** Objekt-URLs für Blobs verwalten, damit kein Speicher leckt */
const urls = new Set();
export function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return url;
}
export function releaseBlobUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}
