/** Einfache, leichte SVG-Diagramme (ohne Bibliothek). Liefern SVG-Markup als String. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Säulen für Tageswerte mit gestrichelter Ziellinie.
 * @param {{label:string, value:number, goal:number|null, logged:boolean}[]} data
 */
export function barChart(data, { width = 340, height = 170, color = 'var(--accent)', over = 'var(--danger)' } = {}) {
  const pad = { t: 10, r: 6, b: 22, l: 36 };
  const w = width - pad.l - pad.r;
  const hh = height - pad.t - pad.b;
  const maxVal = Math.max(1, ...data.map((d) => d.value), ...data.map((d) => d.goal ?? 0)) * 1.1;
  const y = (v) => pad.t + hh - (v / maxVal) * hh;
  const step = w / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(26, step * 0.65));
  const labelEvery = Math.ceil(data.length / 8);
  const ticks = niceTicks(maxVal, 3);

  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Kalorien pro Tag">`;
  for (const t of ticks) {
    out += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
    out += `<text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end" class="axis">${t}</text>`;
  }
  data.forEach((d, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    if (d.logged && d.value > 0) {
      const fill = d.goal && d.value > d.goal * 1.1 ? over : color;
      out += `<rect x="${x}" y="${y(d.value)}" width="${bw}" height="${pad.t + hh - y(d.value)}" rx="${Math.min(4, bw / 2)}" fill="${fill}"><title>${esc(d.label)}: ${Math.round(d.value)} kcal</title></rect>`;
    }
    if (i % labelEvery === 0) out += `<text x="${x + bw / 2}" y="${height - 6}" text-anchor="middle" class="axis">${esc(d.label)}</text>`;
  });
  // Ziellinie (kann sich über die Zeit ändern → als Stufenlinie)
  const goalPts = data.map((d, i) => (d.goal ? [pad.l + i * step, y(d.goal), pad.l + (i + 1) * step] : null));
  let path = '';
  goalPts.forEach((p) => { if (p) path += `M${p[0]},${p[1]}H${p[2]}`; });
  if (path) out += `<path d="${path}" class="goal-line"/>`;
  return `${out}</svg>`;
}

/**
 * Linie für Gewichtsverlauf.
 * @param {{x:number, y:number, label:string}[]} points x = Tagesindex
 */
export function lineChart(points, { width = 340, height = 170, xMax } = {}) {
  if (points.length < 2) return '';
  const pad = { t: 12, r: 10, b: 22, l: 40 };
  const w = width - pad.l - pad.r;
  const hh = height - pad.t - pad.b;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;
  const xm = xMax ?? Math.max(...points.map((p) => p.x));
  const x0 = Math.min(...points.map((p) => p.x));
  const X = (x) => pad.l + ((x - x0) / Math.max(1, xm - x0)) * w;
  const Y = (v) => pad.t + hh - ((v - lo) / (hi - lo)) * hh;

  let out = `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Gewichtsverlauf">`;
  for (const t of [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]) {
    out += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/>`;
    out += `<text x="${pad.l - 6}" y="${Y(t) + 4}" text-anchor="end" class="axis">${t.toFixed(1).replace('.', ',')}</text>`;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  out += `<path d="${d}" class="line"/>`;
  points.forEach((p) => { out += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.5" class="point"><title>${esc(p.label)}: ${p.y.toString().replace('.', ',')} kg</title></circle>`; });
  out += `<text x="${pad.l}" y="${height - 6}" class="axis">${esc(points[0].label)}</text>`;
  out += `<text x="${width - pad.r}" y="${height - 6}" text-anchor="end" class="axis">${esc(points[points.length - 1].label)}</text>`;
  return `${out}</svg>`;
}

export function niceTicks(max, count) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = step; v < max; v += step) ticks.push(Math.round(v));
  return ticks;
}
