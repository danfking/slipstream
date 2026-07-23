// Presenter deck: the written pack served from /pack, rendered through the
// same markdown pipeline as chat replies (same repair transforms, same
// sanitizer, same lint guarantees), navigated like slides. Print = every
// slide stacked = the standalone pack Bhavina's team reviews.

import { renderMarkdown } from './render.js';
import remend from './vendor/remend.js';

const deps = {
  parse: (s, o) => window.marked.parse(s, o),
  sanitize: (s) => window.DOMPurify.sanitize(s),
  complete: (s) => remend(s),
};

const slidesEl = document.getElementById('slides');
const counterEl = document.getElementById('slide-counter');

// Two modes over one deck. Detail (full prose) is the default, so the bare
// shared link always opens the pack the panel reads. Present (short bullets)
// is what Dan speaks from, reached with ?mode=present, the header button, or
// the 'p' key. The mode is a body class; CSS swaps which variant shows.
const modeFromUrl = () => (new URLSearchParams(location.search).get('mode') === 'present' ? 'present' : 'detail');
function applyMode(mode) {
  document.body.classList.toggle('mode-present', mode === 'present');
  const btn = document.getElementById('mode-toggle');
  if (btn) {
    btn.textContent = mode === 'present' ? 'reading view' : 'talk view';
    btn.setAttribute('aria-pressed', String(mode === 'present'));
  }
}
function setMode(mode) {
  const params = new URLSearchParams(location.search);
  if (mode === 'present') params.set('mode', 'present');
  else params.delete('mode');
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  applyMode(mode);
}

const manifest = await fetch('/pack/manifest.json').then((r) => r.json());
document.getElementById('deck-title').textContent = manifest.title;
document.title = manifest.title;

const sources = await Promise.all(
  manifest.slides.map(async (s) => ({
    detail: await fetch(`/pack/${s.file}`).then((r) => r.text()),
    presenter: s.presenter ? await fetch(`/pack/${s.presenter}`).then((r) => r.text()) : null,
  })),
);

for (const [i, { detail, presenter }] of sources.entries()) {
  const section = document.createElement('section');
  section.className = presenter ? 'slide' : 'slide no-presenter';
  section.id = `slide-${i + 1}`;
  section.innerHTML =
    `<div class="variant detail">${renderMarkdown(detail, [], deps)}</div>` +
    (presenter ? `<div class="variant presenter">${renderMarkdown(presenter, [], deps)}</div>` : '');
  slidesEl.appendChild(section);
}

applyMode(modeFromUrl());

const total = manifest.slides.length;
let current = Math.min(Math.max(Number(location.hash.replace('#/', '')) || 1, 1), total);

function show(n) {
  current = Math.min(Math.max(n, 1), total);
  for (const [i, el] of [...slidesEl.children].entries()) {
    el.classList.toggle('active', i === current - 1);
  }
  counterEl.textContent = `${current} / ${total}`;
  document.getElementById('deck-progress').style.width = `${(current / total) * 100}%`;
  document.getElementById('nav-prev').disabled = current === 1;
  document.getElementById('nav-next').disabled = current === total;
  history.replaceState(null, '', `#/${current}`);
}

document.addEventListener('keydown', (e) => {
  if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) {
    e.preventDefault();
    show(current + 1);
  } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
    e.preventDefault();
    show(current - 1);
  } else if (e.key === 'Home') {
    show(1);
  } else if (e.key === 'End') {
    show(total);
  } else if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Bare 'p' flips the mode; the modifier guard leaves Ctrl+P (print) alone.
    e.preventDefault();
    setMode(document.body.classList.contains('mode-present') ? 'detail' : 'present');
  }
});
document.getElementById('nav-prev').addEventListener('click', () => show(current - 1));
document.getElementById('nav-next').addEventListener('click', () => show(current + 1));
document.getElementById('mode-toggle')?.addEventListener('click', () => {
  setMode(document.body.classList.contains('mode-present') ? 'detail' : 'present');
});
window.addEventListener('hashchange', () => show(Number(location.hash.replace('#/', '')) || 1));

show(current);
