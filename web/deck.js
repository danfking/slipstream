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

const manifest = await fetch('/pack/manifest.json').then((r) => r.json());
document.getElementById('deck-title').textContent = manifest.title;
document.title = manifest.title;

const sources = await Promise.all(
  manifest.slides.map((s) => fetch(`/pack/${s.file}`).then((r) => r.text())),
);

for (const [i, raw] of sources.entries()) {
  const section = document.createElement('section');
  section.className = 'slide';
  section.id = `slide-${i + 1}`;
  section.innerHTML = renderMarkdown(raw, [], deps);
  slidesEl.appendChild(section);
}

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
  }
});
document.getElementById('nav-prev').addEventListener('click', () => show(current - 1));
document.getElementById('nav-next').addEventListener('click', () => show(current + 1));
window.addEventListener('hashchange', () => show(Number(location.hash.replace('#/', '')) || 1));

show(current);
