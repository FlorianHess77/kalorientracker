// Ersetzt App-Symbol und Startbild des Capacitor-Projekts durch die Kalorientracker-Grafiken.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const RES = 'android/app/src/main/res';
const GREEN = '#2f7d4f';
const icon = readFileSync('assets/icon.svg');
const squareIcon = Buffer.from(icon.toString().replace('rx="112"', 'rx="0"'));
const foreground = readFileSync('assets/icon-foreground.svg');

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [dpi, size] of Object.entries(LAUNCHER)) {
  const dir = join(RES, `mipmap-${dpi}`);
  if (!existsSync(dir)) continue;
  await sharp(icon).resize(size, size).png().toFile(join(dir, 'ic_launcher.png'));
  const r = size / 2;
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}"/></svg>`);
  await sharp(squareIcon).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(join(dir, 'ic_launcher_round.png'));
  await sharp(foreground).resize(FOREGROUND[dpi], FOREGROUND[dpi]).png().toFile(join(dir, 'ic_launcher_foreground.png'));
}

// Hintergrundfarbe des adaptiven Symbols
const bgFile = join(RES, 'values', 'ic_launcher_background.xml');
if (existsSync(bgFile)) {
  writeFileSync(bgFile, readFileSync(bgFile, 'utf8').replace(/<color name="ic_launcher_background">[^<]*<\/color>/, `<color name="ic_launcher_background">${GREEN}</color>`));
}

// Startbilder (splash.png in allen drawable-Ordnern) in gleicher Größe ersetzen
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
let splashes = 0;
for (const file of walk(RES).filter((f) => f.endsWith('splash.png'))) {
  const { width, height } = await sharp(file).metadata();
  const s = Math.round(Math.min(width, height) * 0.35);
  const logo = await sharp(icon).resize(s, s).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: '#121412' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file + '.tmp');
  writeFileSync(file, readFileSync(file + '.tmp'));
  unlinkSync(file + '.tmp');
  splashes++;
}
console.log(`✓ Symbole erzeugt, ${splashes} Startbilder ersetzt`);
