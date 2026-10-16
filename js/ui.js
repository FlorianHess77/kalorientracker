/** Kleine UI-Bibliothek ohne Framework: DOM-Helfer, Icons, Ringe, Dialoge, Toasts. */

/**
 * h('div', { class: 'card', onclick: fn }, 'Text', child, [weitere])
 * Props: class, style (Objekt oder String), on<event>, dataset, html (vertrauenswürdiges HTML), sonst Attribute.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'html') el.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') el.value = value;
      else if (key === 'checked') el.checked = Boolean(value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ───────────── Icons (inline SVG, eigene einfache Formen) ─────────────
const ICONS = {
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  barcode: '<path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" /><path d="M2 4h4M18 4h4M2 20h4M18 20h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.3 0-3.2 2.3-5.3 3.6-7.5.4 1.8 1.5 2.9 2.4 3.4C11.8 7.7 13 5 15.5 3c-.3 3 3 5.6 3 10.2C18.5 17.8 16 21 12 21z"/>',
  drop: '<path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 10a5 5 0 0 1 7 0L12 13z"/>',
};

export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
  return span;
}

// ───────────── Fortschrittsring ─────────────
/**
 * @param {{ value:number, max:number, size?:number, stroke?:number, color?:string, center?:Node|string, over?:boolean }} o
 */
export function ring({ value, max, size = 180, stroke = 14, color = 'var(--accent)', center, track = 'var(--track)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const over = max > 0 && value > max;
  const wrap = h('div', { class: 'ring', style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : color}"
        stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - ratio)}"
        transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-progress"/>
    </svg>`;
  if (center) wrap.append(h('div', { class: 'ring-center' }, center));
  return wrap;
}

/** Waagrechter Balken */
export function bar(value, max, color = 'var(--accent)') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: `${pct}%`, background: value > max && max > 0 ? 'var(--danger)' : color } }));
}

// ───────────── Bausteine ─────────────
export function button(label, onClick, { variant = 'primary', iconName, disabled, type = 'button', small, block, ariaLabel } = {}) {
  return h(
    'button',
    { type, class: ['btn', `btn-${variant}`, small && 'btn-small', block && 'btn-block'], onclick: onClick, disabled, 'aria-label': ariaLabel, title: ariaLabel },
    iconName ? icon(iconName, small ? 18 : 20) : null,
    label ? h('span', null, label) : null,
  );
}

export function iconButton(name, onClick, label, extraClass = '') {
  return h('button', { type: 'button', class: `icon-btn ${extraClass}`, onclick: onClick, 'aria-label': label, title: label }, icon(name));
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Zahleneingabe mit Einheit; inputmode decimal zeigt am Handy die Zifferntastatur */
export function numberInput({ value, onInput, suffix, placeholder, decimals = true, min, max, id }) {
  const input = h('input', {
    id,
    type: 'text',
    inputmode: decimals ? 'decimal' : 'numeric',
    autocomplete: 'off',
    value: value ?? '',
    placeholder,
    'aria-valuemin': min,
    'aria-valuemax': max,
    oninput: (e) => onInput?.(e.target.value),
  });
  return h('div', { class: 'input-group' }, input, suffix ? h('span', { class: 'input-suffix' }, suffix) : null);
}

export function optionCard({ title, description, selected, disabled, onClick, right }) {
  return h(
    'button',
    { type: 'button', class: ['option', selected && 'selected'], disabled, onclick: onClick, 'aria-pressed': selected ? 'true' : 'false' },
    h('span', { class: 'option-text' }, h('strong', null, title), description ? h('span', null, description) : null),
    right ?? h('span', { class: 'option-check' }, selected ? icon('check', 18) : null),
  );
}

export function segmented(options, value, onChange) {
  return h(
    'div',
    { class: 'segmented', role: 'tablist' },
    options.map((o) =>
      h('button', { type: 'button', role: 'tab', class: o.value === value ? 'active' : '', 'aria-selected': o.value === value ? 'true' : 'false', onclick: () => onChange(o.value) }, o.label),
    ),
  );
}

export function notice(text, kind = 'warning') {
  return h('div', { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, icon(kind === 'info' ? 'info' : 'info', 18), h('span', null, text));
}

export function header(title, { back, right } = {}) {
  return h(
    'header',
    { class: 'topbar' },
    back ? iconButton('left', back, 'Zurück') : h('span', { class: 'topbar-spacer' }),
    h('h1', null, title),
    right ?? h('span', { class: 'topbar-spacer' }),
  );
}

export function macroLine(n) {
  return `${fmt(n.protein_g)} g E · ${fmt(n.carbs_g)} g KH · ${fmt(n.fat_g)} g F`;
}
export const fmt = (n, digits = 0) => (Number.isFinite(n) ? (digits ? n.toFixed(digits) : Math.round(n).toString()).replace('.', ',') : '–');

// ───────────── Toast & Dialoge ─────────────
let toastTimer;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast toast-${kind} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** Bestätigungsdialog. Liefert true/false. */
export function confirmDialog({ title, text, confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(false); } },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title),
        text ? h('p', null, text) : null,
        h('div', { class: 'dialog-actions' },
          button(cancelLabel, () => close(false), { variant: 'secondary' }),
          button(confirmLabel, () => close(true), { variant: danger ? 'danger' : 'primary' })),
      ),
    );
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlay.querySelector('.btn-primary, .btn-danger')?.focus();
  });
}

/** Eingabedialog. Liefert den Text oder null. */
export function promptDialog({ title, label, value = '', confirmLabel = 'Speichern' }) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value, 'aria-label': label, maxlength: '80' });
    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      resolve(result);
    };
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) close(v); } },
      field(label, input),
      h('div', { class: 'dialog-actions' },
        button('Abbrechen', () => close(null), { variant: 'secondary' }),
        button(confirmLabel, null, { type: 'submit' })));
    const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', null, title), form));
    document.body.append(overlay);
    requestAnimationFrame(() => { overlay.classList.add('show'); input.focus(); });
  });
}

/** Ganzseitige Ladeanzeige. Gibt eine Funktion zum Schließen zurück. */
export function busy(message) {
  const el = h('div', { class: 'overlay show busy', role: 'alert', 'aria-busy': 'true' }, h('div', { class: 'busy-box' }, h('div', { class: 'spinner' }), h('p', null, message)));
  document.body.append(el);
  return {
    update: (msg) => { el.querySelector('p').textContent = msg; },
    close: () => el.remove(),
  };
}

/** Datei an den Nutzer geben (Download bzw. Teilen-Dialog am Handy) */
export async function saveFile(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Datei-Auswahl öffnen (z. B. Kamera). Liefert die Datei oder null. */
export function pickFile({ accept = 'image/*', capture } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, capture, style: { display: 'none' } });
    let done = false;
    const finish = (file) => { if (done) return; done = true; input.remove(); resolve(file); };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
