// The markdown pipeline's machine gates: fixture corpus rendering, source lint
// (markdownlint), idempotence, and the streaming prefix-stability property.
// These tests are the reason no human has to eyeball rendered replies.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import remend from 'remend';
import { lint as mdlint } from 'markdownlint/sync';
import { lintRendered, normalizeMarkdown, renderMarkdown, visibleText } from '../render.js';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const deps = {
  parse: (s, o) => marked.parse(s, o),
  sanitize: (s) => DOMPurify.sanitize(s),
  complete: (s) => remend(s),
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'replies');
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => ({ name: f, raw: readFileSync(join(fixturesDir, f), 'utf-8') }));

// The written pack rides the same pipeline as chat replies, so it gets the
// same machine gate: every slide must render lint-free.
const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'pack');
const packSlides = readdirSync(packDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, raw: readFileSync(join(packDir, f), 'utf-8') }));

describe('pack slides render clean', () => {
  test.each(packSlides.map((f) => [f.name, f.raw]))('%s → lint-free HTML', (_name, raw) => {
    const html = renderMarkdown(raw, [], deps);
    expect(lintRendered(raw, html)).toEqual([]);
  });

  test('pack slides follow house style: no em dashes', () => {
    // The pack is authored prose presented as the operator's own writing, and
    // the house style bans em dashes in every medium. Model chat output is
    // exempt (model voice); the pack is not.
    for (const f of packSlides) {
      expect(f.raw.includes('—'), `${f.name} contains an em dash`).toBe(false);
    }
  });

  const detailFiles = packSlides.filter((f) => !f.name.endsWith('.presenter.md'));
  const presenterFiles = packSlides.filter((f) => f.name.endsWith('.presenter.md'));
  const firstHeading = (raw) => (raw.match(/^#\s+(.+)$/m) ?? [, ''])[1].trim();

  test('manifest lists every detail slide and every presenter sidecar, no orphans', () => {
    const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8'));
    const listedDetail = manifest.slides.map((s) => s.file).sort();
    expect(listedDetail).toEqual(detailFiles.map((f) => f.name).sort());
    const listedPresenter = manifest.slides.map((s) => s.presenter).filter(Boolean).sort();
    expect(listedPresenter).toEqual(presenterFiles.map((f) => f.name).sort());
  });

  test('each presenter slide shares its detail slide title (drift alarm)', () => {
    const byName = new Map(packSlides.map((f) => [f.name, f.raw]));
    for (const f of presenterFiles) {
      const detail = byName.get(f.name.replace('.presenter.md', '.md'));
      expect(detail, `${f.name} has no matching detail file`).toBeDefined();
      expect(firstHeading(f.raw), `${f.name} title drifted from its detail slide`).toBe(firstHeading(detail));
    }
  });

  test('presenter slides are bullets only: h1, optional ### subheads, list items', () => {
    for (const f of presenterFiles) {
      const body = f.raw.split('\n').slice(1); // drop the h1 line
      let bullets = 0;
      for (const line of body) {
        const t = line.trim();
        if (!t) continue;
        const ok = t.startsWith('- ') || t.startsWith('### ');
        expect(ok, `${f.name} has non-bullet prose: "${t.slice(0, 50)}"`).toBe(true);
        if (t.startsWith('- ')) bullets++;
      }
      expect(bullets, `${f.name} has no bullets`).toBeGreaterThan(0);
    }
  });
});

// 06 exists to prove the lint CATCHES what repair correctly refuses to guess at.
const expectFlagged = new Set(['06-unbalanced-emphasis.txt']);
const clean = fixtures.filter((f) => !expectFlagged.has(f.name));
const flagged = fixtures.filter((f) => expectFlagged.has(f.name));

describe('fixture corpus renders clean', () => {
  test.each(clean.map((f) => [f.name, f.raw]))('%s → lint-free HTML', (_name, raw) => {
    const html = renderMarkdown(raw, ['get_unbilled_work', 'get_schedule_load'], deps);
    expect(lintRendered(raw, html)).toEqual([]);
  });

  test.each(flagged.map((f) => [f.name, f.raw]))('%s → lint reports the defect', (_name, raw) => {
    const html = renderMarkdown(raw, [], deps);
    expect(lintRendered(raw, html)).not.toEqual([]);
  });

  test('DOMPurify removed nothing from any clean fixture (nothing hostile snuck through the pipeline)', () => {
    for (const f of clean) {
      DOMPurify.sanitize(deps.parse(normalizeMarkdown(f.raw), { breaks: true }));
      expect(DOMPurify.removed).toEqual([]);
    }
  });
});

describe('normalized source passes markdownlint defect-class rules', () => {
  // MD037 spaces-in-emphasis, MD022 blanks around headings, MD032 blanks around
  // lists — exactly the classes that produced the escaped screenshot bugs.
  const config = { default: false, MD037: true, MD022: true, MD032: true };

  test.each(clean.map((f) => [f.name, f.raw]))('%s → zero findings', (_name, raw) => {
    const results = mdlint({ strings: { s: normalizeMarkdown(raw) }, config });
    expect(results.s.map((r) => `${r.ruleNames[0]}:${r.lineNumber}`)).toEqual([]);
  });
});

describe('normalize is idempotent', () => {
  test.each(fixtures.map((f) => [f.name, f.raw]))('%s', (_name, raw) => {
    const once = normalizeMarkdown(raw);
    expect(normalizeMarkdown(once)).toBe(once);
  });
});

describe('prefix stability (streaming readiness)', () => {
  // Rendering every prefix must never throw, and the full-buffer render must be
  // lint-free — this is the property that makes progressive reveal a display
  // change later, not a pipeline change. Step > 1 keeps the suite fast while
  // still crossing every marker boundary in the fixtures.
  test.each(clean.map((f) => [f.name, f.raw]))('%s', (_name, raw) => {
    for (let i = 1; i <= raw.length; i += 3) {
      const html = renderMarkdown(raw.slice(0, i), [], deps);
      expect(typeof html).toBe('string');
    }
    const full = renderMarkdown(raw, [], deps);
    expect(lintRendered(raw, full)).toEqual([]);
  });

  test('an unterminated bold mid-stream is completed by remend, not rendered as asterisks', () => {
    const html = renderMarkdown('The headline is **$16,4', [], deps);
    expect(visibleText(html)).not.toContain('**');
    expect(html).toContain('<strong>');
  });
});
