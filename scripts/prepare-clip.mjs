// Bereitet die zweite Foto-Erkennung (MobileCLIP) vor – läuft beim Veröffentlichen auf GitHub.
//  1. lädt das Bild-Modell (ca. 12 MB) nach models/clip/
//  2. berechnet die Text-Fingerabdrücke für alle Begriffe aus js/data/clip-vocab.js
//  3. prüft das Ganze mit ein paar Testbildern und schreibt das Ergebnis in build-info.json
// Aufruf: node scripts/prepare-clip.mjs <Ordner mit node_modules/@huggingface/transformers>
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLIP_VOCAB, CLIP_TEMPLATES } from '../js/data/clip-vocab.js';

const MODEL = 'Xenova/mobileclip_s0';
const OUT = 'models/clip';
const req = createRequire(join(process.argv[2], 'index.js'));
const mod = await import(pathToFileURL(req.resolve('@huggingface/transformers')).href);
const T = mod.AutoTokenizer ? mod : mod.default;

const info = existsSync('build-info.json') ? JSON.parse(readFileSync('build-info.json', 'utf8')) : {};
const save = () => writeFileSync('build-info.json', JSON.stringify(info, null, 2));

try {
  // ── 1. Bild-Modell für den Browser bereitstellen ──
  const dir = join(OUT, MODEL);
  mkdirSync(join(dir, 'onnx'), { recursive: true });
  for (const f of ['config.json', 'preprocessor_config.json', 'onnx/vision_model_quantized.onnx']) {
    const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    writeFileSync(join(dir, f), Buffer.from(await res.arrayBuffer()));
  }

  // ── 2. Text-Fingerabdrücke (Mittelwert über mehrere Satzvorlagen) ──
  const tokenizer = await T.AutoTokenizer.from_pretrained(MODEL);
  const textModel = await T.CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32' });
  let dim = 0;
  const embeds = [];
  for (const [term] of CLIP_VOCAB) {
    const prompts = CLIP_TEMPLATES.map((t) => t.replace('{}', term));
    const inputs = tokenizer(prompts, { padding: 'max_length', truncation: true });
    const { text_embeds } = await textModel(inputs);
    const rows = text_embeds.normalize().tolist();
    dim = rows[0].length;
    const mean = new Array(dim).fill(0);
    for (const r of rows) r.forEach((v, i) => { mean[i] += v / rows.length; });
    const norm = Math.hypot(...mean);
    embeds.push(mean.map((v) => v / norm));
  }
  const flat = new Float32Array(embeds.length * dim);
  embeds.forEach((e, i) => flat.set(e, i * dim));
  writeFileSync(join(OUT, 'text-embeds.bin'), Buffer.from(flat.buffer));
  writeFileSync(join(OUT, 'vocab.json'), JSON.stringify({ model: MODEL, dim, scale: 100, items: CLIP_VOCAB.map(([term, ref]) => ({ term, ref })) }));
  console.log(`✓ ${CLIP_VOCAB.length} Begriffe, ${dim} Dimensionen`);

  // ── 3. Probe mit Testbildern ──
  const processor = await T.AutoProcessor.from_pretrained(MODEL);
  const visionModel = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
  const tests = {
    steak: 'https://commons.wikimedia.org/wiki/Special:FilePath/Venison_Steaks.jpg?width=512',
    fries: 'https://commons.wikimedia.org/wiki/Special:FilePath/French_Fries.JPG?width=512',
    pizza: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizza-3007395.jpg?width=512',
  };
  info.clipTest = {};
  for (const [name, url] of Object.entries(tests)) {
    try {
      const image = await T.RawImage.read(url);
      const { image_embeds } = await visionModel(await processor(image));
      const v = image_embeds.normalize().tolist()[0];
      const logits = embeds.map((e) => 100 * e.reduce((s, x, i) => s + x * v[i], 0));
      const max = Math.max(...logits);
      const exp = logits.map((l) => Math.exp(l - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      info.clipTest[name] = exp.map((p, i) => [CLIP_VOCAB[i][0], Math.round((p / sum) * 100)])
        .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, p]) => `${t} ${p}%`);
    } catch (e) {
      info.clipTest[name] = `Fehler: ${e.message}`;
    }
  }
  info.clip = { ok: true, terms: CLIP_VOCAB.length, dim };
  console.log('Probe:', JSON.stringify(info.clipTest));
} catch (e) {
  info.clip = { ok: false, error: String(e?.stack ?? e).slice(0, 600) };
  console.error('⚠ CLIP nicht vorbereitet:', e);
}
save();
