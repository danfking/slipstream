// Node-side instantiation of the browser markdown pipeline, for the golden
// batch and soak gates. Same pure functions, npm-provided parse/sanitize.

import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import remend from 'remend';
// @ts-ignore — plain-JS browser module, shared verbatim with the web UI
import { lintRendered, renderMarkdown } from '../../web/render.js';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Window & typeof globalThis);

const deps = {
  parse: (s: string, o: object) => marked.parse(s, o) as string,
  sanitize: (s: string) => DOMPurify.sanitize(s),
  complete: (s: string) => remend(s),
};

/** Render a reply exactly as the browser would; return lint issues (empty = clean). */
export function lintReply(raw: string, toolNames: string[]): string[] {
  const html = renderMarkdown(raw, toolNames, deps);
  return lintRendered(raw, html);
}
