// In-memory store over the generated snapshot. In production this layer
// fronts the live ERP database; the tool layer above it is unchanged.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedData } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const db: SeedData = JSON.parse(
  readFileSync(join(root, 'data', 'seed.json'), 'utf-8'),
);

export const customerById = new Map(db.customers.map((c) => [c.id, c]));
export const boatById = new Map(db.boats.map((b) => [b.id, b]));
export const techById = new Map(db.technicians.map((t) => [t.id, t]));
export const partById = new Map(db.parts.map((p) => [p.id, p]));

export function linesFor(workOrderId: string) {
  return db.workOrderLines.filter((l) => l.workOrderId === workOrderId);
}

export function lineTotal(workOrderId: string) {
  return linesFor(workOrderId).reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso + 'T12:00:00Z') - Date.parse(fromIso + 'T12:00:00Z')) /
      86_400_000,
  );
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
