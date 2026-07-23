// @vitest-environment jsdom
//
// The idiomorph spike from issue #7, run as a permanent test: streaming is
// re-render-accumulated-buffer + DOM morph, so morphing every prefix of every
// fixture must (a) never throw, (b) converge to exactly the batch render.
// If this passes across our block types (paragraphs, lists, tables, code,
// strong/em, citation buttons), idiomorph is proven against our real output.
// jsdom environment: idiomorph touches many browser globals; this is the
// full set, not a hand-maintained shim.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import remend from 'remend';
import { Idiomorph } from 'idiomorph';
import { renderMarkdown } from '../render.js';

document.body.innerHTML = '<div id="bubble"></div>';
const deps = {
  parse: (s, o) => marked.parse(s, o),
  sanitize: (s) => DOMPurify.sanitize(s),
  complete: (s) => remend(s),
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'replies');
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => ({ name: f, raw: readFileSync(join(fixturesDir, f), 'utf-8') }));

describe('streamed morph converges to the batch render (idiomorph spike, kept)', () => {
  test.each(fixtures.map((f) => [f.name, f.raw]))('%s', (_name, raw) => {
    const el = document.getElementById('bubble');
    el.innerHTML = '';
    for (let i = 1; i <= raw.length; i += 7) {
      const html = renderMarkdown(raw.slice(0, i), ['get_unbilled_work'], deps);
      Idiomorph.morph(el, html, { morphStyle: 'innerHTML' });
    }
    const finalHtml = renderMarkdown(raw, ['get_unbilled_work'], deps);
    Idiomorph.morph(el, finalHtml, { morphStyle: 'innerHTML' });

    const reference = document.createElement('div');
    reference.innerHTML = finalHtml;
    expect(el.innerHTML).toBe(reference.innerHTML);
  });
});
