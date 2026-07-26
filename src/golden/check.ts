// Golden-batch cases and the accuracy check, shared by the CLI runner
// (scripts/golden.ts) and the in-app runner (/api/golden/run). Real questions
// with known answers: a reply passes when it states the required figures and
// called the required tools.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GoldenCase {
  id: string;
  question: string;
  mustInclude: string[];
  mustCallTools: string[];
  // Out-of-scope cases assert the opposite: a question the tool layer cannot
  // answer must not produce a figure, and must not reach for a nearby tool.
  mustNotInclude?: string[];
  mustNotCallTools?: string[];
}

export function loadGoldenCases(): GoldenCase[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return JSON.parse(readFileSync(join(root, 'golden', 'golden.json'), 'utf-8'));
}

// Lowercase, drop currency/comma separators, and collapse whitespace used as a
// thousands separator ("14 520" -> "14520") without touching word spacing.
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[$,]/g, '')
    .replace(/(\d)[\s  ]+(?=\d)/g, '$1');

/** Returns the list of failed assertions, empty when the reply passes. */
export function checkReply(reply: string, toolNames: string[], c: GoldenCase): string[] {
  const norm = normalize(reply ?? '');
  const called = new Set(toolNames);
  const missing: string[] = [];
  for (const needle of c.mustInclude) if (!norm.includes(normalize(needle))) missing.push(`text:"${needle}"`);
  for (const tool of c.mustCallTools) if (!called.has(tool)) missing.push(`tool:${tool}`);
  for (const needle of c.mustNotInclude ?? [])
    if (norm.includes(normalize(needle))) missing.push(`unexpected-text:"${needle}"`);
  for (const tool of c.mustNotCallTools ?? [])
    if (called.has(tool)) missing.push(`unexpected-tool:${tool}`);
  return missing;
}
