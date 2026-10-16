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

  // ── 3. Varianten des Bild-Modells mit Testbildern vergleichen und die beste nehmen ──
  const processor = await T.AutoProcessor.from_pretrained(MODEL);
  const C = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
  const tests = [
    ['steak', `${C}Venison_Steaks.jpg?width=640`, /steak|Rinder/i],
    ['fries', `${C}Fries_2.jpg?width=640`, /Pommes/i],
    ['fries2', `${C}French_Fries.JPG?width=640`, /Pommes/i],
    ['pizza', `${C}Eq_it-na_pizza-margherita_sep2005_sml.jpg?width=640`, /pizza/i],
    ['beans', `${C}Green_beans.jpg?width=640`, /Fisolen/i],
    ['salad', `${C}Salad_platter.jpg?width=640`, /salat|salad/i],
  ];
  const images = [];
  for (const [name, url, expect] of tests) {
    try { images.push([name, await T.RawImage.read(url), expect]); } catch (e) { info.clipImageErrors = { ...(info.clipImageErrors ?? {}), [name]: e.message }; }
  }
  const cats = await T.RawImage.read('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg').catch(() => null);
  const animalEmbeds = [];
  for (const t of ['a photo of cats', 'a photo of dogs', 'a photo of birds']) {
    const { text_embeds } = await textModel(tokenizer([t], { padding: 'max_length', truncation: true }));
    animalEmbeds.push(text_embeds.normalize().tolist()[0]);
  }
  const probs = (v, list) => {
    const logits = list.map((e) => 100 * e.reduce((sum, x, i) => sum + x * v[i], 0));
    const max = Math.max(...logits);
    const exp = logits.map((l) => Math.exp(l - max));
    const total = exp.reduce((a, b) => a + b, 0);
    return exp.map((x) => x / total);
  };
  const FILES = { q8: 'vision_model_quantized.onnx', fp16: 'vision_model_fp16.onnx', fp32: 'vision_model.onnx' };
  info.clipEval = {};
  for (const dtype of ['q8', 'fp16', 'fp32']) {
    try {
      const visionModel = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype });
      const embedOf = async (img) => (await visionModel(await processor(img))).image_embeds.normalize().tolist()[0];
      const res = { };
      let score = 0;
      if (cats) res.cats = `${Math.round(probs(await embedOf(cats), animalEmbeds)[0] * 100)}% Katzen`;
      for (const [name, img, expect] of images) {
        const p = probs(await embedOf(img), embeds);
        const top = p.map((x, i) => [i, x]).sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (expect.test(String(CLIP_VOCAB[top[0][0]][1]))) score++;
        res[name] = top.map(([i, x]) => `${CLIP_VOCAB[i][0]} ${Math.round(x * 100)}%`);
      }
      res.score = score;
      info.clipEval[dtype] = res;
    } catch (e) {
      info.clipEval[dtype] = `Fehler: ${e.message}`;
    }
  }
  // Varianten für den Browser bereitstellen: die genaueste kleine zuerst, fp32 als Rückfallebene
  // (manche Browser können fp16-Modelle nicht ausführen)
  const order = ['fp16', 'fp32', 'q8'].filter((d) => typeof info.clipEval[d] === 'object')
    .sort((a, b) => info.clipEval[b].score - info.clipEval[a].score);
  const dtypes = order.filter((d) => info.clipEval[d].score === info.clipEval[order[0]].score);
  if (!dtypes.includes('fp32') && typeof info.clipEval.fp32 === 'object') dtypes.push('fp32');
  for (const d of dtypes) {
    if (d === 'q8') continue; // liegt schon bereit
    const f = `onnx/${FILES[d]}`;
    const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    writeFileSync(join(dir, f), Buffer.from(await res.arrayBuffer()));
  }
  const vocabFile = JSON.parse(readFileSync(join(OUT, 'vocab.json'), 'utf8'));
  writeFileSync(join(OUT, 'vocab.json'), JSON.stringify({ ...vocabFile, dtype: dtypes[0], dtypes }));
  info.clipDtype = dtypes;
  console.log('Vergleich:', JSON.stringify(info.clipEval));
  info.clip = { ok: true, terms: CLIP_VOCAB.length, dim };
} catch (e) {
  info.clip = { ok: false, error: String(e?.stack ?? e).slice(0, 600) };
  console.error('⚠ CLIP nicht vorbereitet:', e);
}
save();
