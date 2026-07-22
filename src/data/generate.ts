// Deterministic synthetic-data generator for the Slipstream demo.
// Run: npm run seed  → writes data/seed.json
//
// The dataset is a snapshot of "Harborview Marina & Boatyard" on 2026-10-05,
// mid haul-out season. Four findings are deliberately engineered into the data
// so demo queries surface them live:
//   1. ~$19k of completed-but-unbilled labour across service work orders
//   2. Haul-out demand exceeds haul-capable technician capacity in the week
//      of Oct 12 (one of two haul techs on leave)
//   3. Six jobs blocked on zero-stock parts whose PO arrives after the
//      scheduled start (one belongs to the top commercial customer)
//   4. Overdue receivables concentrated in one commercial account
// Everything else is plausible filler generated from a fixed PRNG seed.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR_DATE,
  type Boat,
  type Customer,
  type Invoice,
  type Part,
  type SeedData,
  type Slip,
  type TechSkill,
  type Technician,
  type WorkOrder,
  type WorkOrderLine,
} from './types.js';

// --- deterministic PRNG -----------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

// --- date helpers (all relative to the anchor snapshot) ---------------------
const anchor = new Date(ANCHOR_DATE + 'T12:00:00Z');
function day(offset: number): string {
  const d = new Date(anchor);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// --- name pools -------------------------------------------------------------
const firstNames = ['Alan', 'Brooke', 'Carl', 'Dana', 'Evan', 'Fiona', 'Gus', 'Helen', 'Ivan', 'Joan', 'Kurt', 'Lena', 'Marta', 'Ned', 'Olive', 'Pete', 'Quinn', 'Rosa', 'Sam', 'Tessa', 'Uma', 'Vince', 'Wendy', 'Xavier', 'Yara', 'Zach', 'Bram', 'Cleo', 'Dot', 'Ewan', 'Faye', 'Gil', 'Hana', 'Iris'];
const lastNames = ['Abbott', 'Barnes', 'Cortez', 'Dunn', 'Ellis', 'Ferris', 'Grant', 'Hale', 'Ibarra', 'Jensen', 'Keller', 'Lowe', 'Meyer', 'Nash', 'Osman', 'Pratt', 'Reyes', 'Stone', 'Tran', 'Underhill', 'Vaughn', 'Walsh', 'Yates', 'Zeller'];
const boatNames = ['Second Wind', 'Blue Heron', 'Restless', 'Sea Change', 'Knot Working', 'Halcyon', 'Drift Away', 'North Star', 'Tide Runner', 'Mistral', 'Osprey', 'Ballast Point', 'Reel Time', 'Windward', 'Calypso', 'Pelican', 'Slack Tide', 'Meridian', 'Fair Lead', 'Gannet', 'Squall Line', 'Kestrel', 'Bufflehead', 'Last Call', 'Compass Rose', 'Ondine', 'Petrel', 'Marlin', 'Cormorant', 'Ketch-22', 'Even Keel', 'Rum Line', 'Shearwater', 'Argo', 'Tempest', 'Sandpiper', 'Nor\'easter', 'Bluebill', 'Topsail', 'Wanderer', 'Ariel', 'Skimmer'];
const sailMakes = ['Catalina 320', 'Beneteau Oceanis 38', 'Hunter 36', 'Sabre 38', 'J/35', 'Tartan 3700', 'Hallberg-Rassy 40'];
const powerMakes = ['Grady-White 275', 'Boston Whaler 280', 'Sea Ray 320', 'Back Cove 34', 'Regulator 26', 'Pursuit S 328', 'MJM 36z', 'Parker 2320'];

// --- customers --------------------------------------------------------------
const commercialNames = [
  'Bayline Charters LLC',
  'Northeast Sailing School',
  'Harborview Yacht Sales',
  'Coastal Towing Co.',
];
const customers: Customer[] = [];
let custN = 0;
for (const name of commercialNames) {
  custN++;
  customers.push({
    id: `C${String(custN).padStart(3, '0')}`,
    name,
    email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
    phone: `401-555-0${between(100, 199)}`,
    type: 'commercial',
    customerSince: String(between(2009, 2020)),
  });
}
const usedNames = new Set<string>();
while (customers.length < 42) {
  const nm = `${pick(firstNames)} ${pick(lastNames)}`;
  if (usedNames.has(nm)) continue;
  usedNames.add(nm);
  custN++;
  customers.push({
    id: `C${String(custN).padStart(3, '0')}`,
    name: nm,
    email: nm.toLowerCase().replace(/ /g, '.') + '@example.com',
    phone: `401-555-0${between(200, 999)}`,
    type: rnd() < 0.9 ? 'seasonal' : 'transient',
    customerSince: String(between(2008, 2025)),
  });
}

// --- boats ------------------------------------------------------------------
const boats: Boat[] = [];
let boatN = 0;
const boatNamePool = [...boatNames];
for (const c of customers) {
  const count = c.type === 'commercial' ? between(2, 3) : 1;
  for (let i = 0; i < count && boatNamePool.length > 0; i++) {
    boatN++;
    const isSail = rnd() < 0.45;
    const lengthFt = isSail ? between(28, 42) : between(22, 38);
    boats.push({
      id: `B${String(boatN).padStart(3, '0')}`,
      customerId: c.id,
      name: boatNamePool.splice(Math.floor(rnd() * boatNamePool.length), 1)[0],
      make: isSail ? pick(sailMakes) : pick(powerMakes),
      lengthFt,
      kind: isSail ? 'sail' : 'power',
      location: 'wet_slip', // adjusted during slip assignment below
    });
  }
}

// --- slips ------------------------------------------------------------------
// Docks: A (20 slips, ≤30ft, $14/ft), B (24, ≤42ft, $16/ft),
// C (16 premium, ≤60ft, $22/ft), DS (40 dry stack, ≤28ft, $9/ft).
const slips: Slip[] = [];
const dockSpecs = [
  { dock: 'A', count: 20, maxLen: 30, rate: 14 },
  { dock: 'B', count: 24, maxLen: 42, rate: 16 },
  { dock: 'C', count: 16, maxLen: 60, rate: 22 },
  { dock: 'DS', count: 40, maxLen: 28, rate: 9 },
];
for (const spec of dockSpecs) {
  for (let n = 1; n <= spec.count; n++) {
    slips.push({
      id: `${spec.dock}-${String(n).padStart(2, '0')}`,
      dock: spec.dock,
      number: n,
      maxLengthFt: spec.maxLen,
      type: spec.dock === 'DS' ? 'dry_stack' : 'wet',
      monthlyRatePerFt: spec.rate,
      status: 'vacant',
    });
  }
}
// Assign boats: small power boats fill the dry stack completely (hook 5:
// dry stack full while premium C-dock wet slips sit vacant).
const dryCandidates = boats.filter((b) => b.kind === 'power' && b.lengthFt <= 28);
const drySlips = slips.filter((s) => s.type === 'dry_stack');
for (let i = 0; i < drySlips.length && i < dryCandidates.length; i++) {
  drySlips[i].status = 'occupied';
  drySlips[i].boatId = dryCandidates[i].id;
  dryCandidates[i].location = 'dry_stack';
}
const wetCandidates = boats.filter((b) => b.location === 'wet_slip');
const wetSlips = slips.filter((s) => s.type === 'wet');
let wi = 0;
for (const b of wetCandidates) {
  // leave 5 of C-dock's 16 premium slips vacant on purpose
  const fit = wetSlips.filter(
    (s) => s.status === 'vacant' && s.maxLengthFt >= b.lengthFt &&
      !(s.dock === 'C' && wetSlips.filter((x) => x.dock === 'C' && x.status === 'occupied').length >= 11),
  );
  if (fit.length === 0) { b.location = 'on_hard'; continue; }
  const s = fit[wi++ % fit.length];
  s.status = 'occupied';
  s.boatId = b.id;
}

// --- technicians ------------------------------------------------------------
// Hook 2 lives here: only Marcus and Ray hold the 'haul' skill, and Ray is on
// leave the week of Oct 12, halving haul capacity in the crunch week.
const technicians: Technician[] = [
  { id: 'T01', name: 'Marcus Webb', skills: ['haul', 'fiberglass'], billableRate: 125, weeklyCapacityHrs: 38 },
  { id: 'T02', name: 'Ray Delgado', skills: ['haul', 'engine'], billableRate: 135, weeklyCapacityHrs: 38, leave: { start: day(7), end: day(11) } },
  { id: 'T03', name: 'Priya Nair', skills: ['engine', 'electrical'], billableRate: 145, weeklyCapacityHrs: 38 },
  { id: 'T04', name: 'Dave Kowalski', skills: ['engine'], billableRate: 135, weeklyCapacityHrs: 38 },
  { id: 'T05', name: 'Jess Trinh', skills: ['electrical', 'rigging'], billableRate: 140, weeklyCapacityHrs: 32 },
  { id: 'T06', name: 'Tom Ferreira', skills: ['rigging', 'detailing'], billableRate: 110, weeklyCapacityHrs: 38 },
  { id: 'T07', name: 'Ana Souza', skills: ['detailing', 'fiberglass'], billableRate: 110, weeklyCapacityHrs: 38 },
];

// --- parts ------------------------------------------------------------------
const partSpecs: Array<[string, string, string, number, number, number, number, number, string?]> = [
  // sku, description, category, onHand, reorderPoint, unitCost, unitPrice, onOrderQty, poEta
  ['IMP-Y6K', 'Impeller kit, Yanmar 6-series', 'engine', 0, 4, 38, 62, 8, day(10)],
  ['FP-VP-D4', 'Fuel pump, Volvo Penta D4', 'engine', 0, 1, 410, 615, 2, day(12)],
  ['STR-SS-125', 'Shaft seal 1.25in', 'drivetrain', 0, 2, 95, 148, 4, day(15)],
  ['BAT-AGM-31', 'AGM battery group 31', 'electrical', 2, 4, 210, 320, 6, day(6)],
  ['ZN-SHAFT-1', 'Shaft zinc 1in', 'drivetrain', 44, 20, 4, 9, 0],
  ['ZN-HULL-PL', 'Hull plate zinc', 'drivetrain', 31, 15, 11, 19, 0],
  ['OIL-15W40-G', 'Engine oil 15W-40 (gal)', 'engine', 26, 12, 19, 34, 0],
  ['FLT-RAC-500', 'Racor 500 fuel filter', 'engine', 9, 6, 21, 38, 0],
  ['AF-PG-G', 'Propylene glycol antifreeze (gal)', 'winterize', 140, 80, 6, 12, 0],
  ['SW-FILM-20', 'Shrink wrap film 20ft roll', 'winterize', 11, 6, 98, 160, 0],
  ['PMP-BLG-1100', 'Bilge pump 1100gph', 'electrical', 5, 3, 42, 75, 0],
  ['THERM-Y-160', 'Thermostat, Yanmar 160F', 'engine', 3, 2, 28, 49, 0],
];
const parts: Part[] = partSpecs.map((p, i) => ({
  id: `P${String(i + 1).padStart(3, '0')}`,
  sku: p[0], description: p[1], category: p[2],
  onHand: p[3], reorderPoint: p[4], unitCost: p[5], unitPrice: p[6],
  onOrderQty: p[7], poEta: p[8],
}));
const partBySku = new Map(parts.map((p) => [p.sku, p]));

// --- work orders + lines ----------------------------------------------------
const workOrders: WorkOrder[] = [];
const workOrderLines: WorkOrderLine[] = [];
let woN = 0;
let lineN = 0;
function addLine(woId: string, kind: 'labor' | 'part', description: string, qty: number, unitPrice: number, billed: boolean, partId?: string) {
  lineN++;
  workOrderLines.push({ id: `L${String(lineN).padStart(4, '0')}`, workOrderId: woId, kind, description, qty, unitPrice, billed, partId });
}
function addWO(wo: Omit<WorkOrder, 'id'>): WorkOrder {
  woN++;
  const full = { id: `WO-${String(woN).padStart(4, '0')}`, ...wo };
  workOrders.push(full);
  return full;
}
const seasonalBoats = boats.filter((b) => b.location !== 'offsite');

// Hook 2: 26 haul-out requests over the next three weeks, most 3-5 hrs.
// Week of Oct 12 (days 7-13) deliberately overbooked: Marcus alone (38h)
// against ~52h of scheduled haul work while Ray is on leave.
const haulBoats = [...seasonalBoats].filter((b) => b.location === 'wet_slip').slice(0, 26);
haulBoats.forEach((b, i) => {
  const inCrunchWeek = i < 13; // 13 jobs * ~4h ≈ 52h scheduled into days 7-13
  const startOffset = inCrunchWeek ? 7 + (i % 6) : 14 + (i % 7);
  const est = between(3, 5);
  const tech = i % 2 === 0 ? 'T01' : 'T02'; // half assigned to Ray, who is on leave in the crunch week
  const wo = addWO({
    boatId: b.id, customerId: b.customerId,
    title: `Haul-out & block — ${b.name}`,
    category: 'haul_out', status: i < 20 ? 'scheduled' : 'approved',
    priority: 'normal', requestedDate: day(-between(5, 20)),
    scheduledStart: i < 20 ? day(startOffset) : undefined,
    technicianId: i < 20 ? tech : undefined,
    estimateHrs: est, requiredSkill: 'haul',
  });
  addLine(wo.id, 'labor', 'Haul, pressure wash, block', est, 120, false);
});

// Hook 1: 14 completed-but-unbilled service jobs, ~$19k of labour,
// several finished more than three weeks ago.
const unbilledSpecs: Array<[string, WorkOrder['category'], TechSkill, number, number]> = [
  // title suffix, category, skill, hours, daysAgoCompleted
  ['100hr engine service', 'engine', 'engine', 9, 32],
  ['Alternator replacement', 'electrical', 'electrical', 6, 29],
  ['Standing rigging inspection', 'rigging', 'rigging', 8, 27],
  ['Gelcoat repair, port bow', 'fiberglass', 'fiberglass', 14, 24],
  ['Raw water pump rebuild', 'engine', 'engine', 7, 22],
  ['Chartplotter install', 'electrical', 'electrical', 11, 19],
  ['Fuel system service', 'engine', 'engine', 8, 16],
  ['Bottom paint touch-up', 'fiberglass', 'fiberglass', 10, 14],
  ['Windlass repair', 'electrical', 'electrical', 6, 12],
  ['Transmission fluid service', 'engine', 'engine', 5, 10],
  ['Compound & wax topsides', 'detailing', 'detailing', 12, 8],
  ['Head replacement', 'engine', 'engine', 7, 7],
  ['Nav light rewire', 'electrical', 'electrical', 5, 6],
  ['Teak brightwork refresh', 'detailing', 'detailing', 9, 5],
];
const unbilledBoats = seasonalBoats.slice(4, 4 + unbilledSpecs.length);
unbilledSpecs.forEach(([title, category, skill, hrs, ago], i) => {
  const b = unbilledBoats[i];
  const tech = technicians.find((t) => t.skills.includes(skill))!;
  const wo = addWO({
    boatId: b.id, customerId: b.customerId,
    title: `${title} — ${b.name}`,
    category, status: 'completed', priority: 'normal',
    requestedDate: day(-ago - between(3, 10)),
    completedDate: day(-ago),
    technicianId: tech.id,
    estimateHrs: hrs, actualHrs: hrs, requiredSkill: skill,
  });
  addLine(wo.id, 'labor', title, hrs, tech.billableRate, false);
  if (rnd() < 0.5) addLine(wo.id, 'part', 'Consumables & shop supplies', 1, between(40, 160), false);
});

// Hook 3: six jobs blocked awaiting zero-stock parts; PO arrives after the
// scheduled start. The first belongs to Bayline Charters (top commercial
// account) and is high priority.
const blockedSpecs: Array<[string, string, number]> = [
  // part sku, title, scheduledOffset (before the PO ETA on purpose)
  ['FP-VP-D4', 'Fuel pump replacement', 4],
  ['IMP-Y6K', 'Impeller service', 3],
  ['IMP-Y6K', 'Impeller service', 5],
  ['STR-SS-125', 'Shaft seal replacement', 6],
  ['STR-SS-125', 'Shaft seal replacement', 8],
  ['BAT-AGM-31', 'House bank replacement (x3)', 2],
];
const baylineBoats = boats.filter((b) => b.customerId === 'C001');
blockedSpecs.forEach(([sku, title, offset], i) => {
  const part = partBySku.get(sku)!;
  const b = i === 0 ? baylineBoats[0] : seasonalBoats[20 + i];
  const skill: TechSkill = sku === 'BAT-AGM-31' ? 'electrical' : 'engine';
  const tech = technicians.find((t) => t.skills.includes(skill))!;
  const wo = addWO({
    boatId: b.id, customerId: b.customerId,
    title: `${title} — ${b.name}`,
    category: skill === 'electrical' ? 'electrical' : 'engine',
    status: 'awaiting_parts', priority: i === 0 ? 'high' : 'normal',
    requestedDate: day(-between(6, 14)),
    scheduledStart: day(offset),
    technicianId: tech.id,
    estimateHrs: between(4, 8), requiredSkill: skill,
    notes: i === 0 ? 'Charter boat — customer loses bookings every day out of service' : undefined,
  });
  addLine(wo.id, 'labor', title, wo.estimateHrs, tech.billableRate, false);
  addLine(wo.id, 'part', part.description, sku === 'BAT-AGM-31' ? 3 : 1, part.unitPrice, false, part.id);
});

// Filler: a dozen routine in-progress / scheduled jobs and some invoiced history.
for (let i = 0; i < 12; i++) {
  const b = seasonalBoats[8 + i * 2];
  const cats: Array<[WorkOrder['category'], TechSkill]> = [['winterize', 'engine'], ['detailing', 'detailing'], ['shrink_wrap', 'detailing'], ['engine', 'engine']];
  const [category, skill] = cats[i % cats.length];
  const tech = technicians.find((t) => t.skills.includes(skill))!;
  const status = i < 5 ? 'in_progress' : 'scheduled';
  const wo = addWO({
    boatId: b.id, customerId: b.customerId,
    title: `${category === 'shrink_wrap' ? 'Shrink wrap' : category === 'winterize' ? 'Winterization' : 'Service'} — ${b.name}`,
    category, status, priority: 'normal',
    requestedDate: day(-between(2, 12)),
    scheduledStart: day(status === 'in_progress' ? -1 : between(1, 12)),
    technicianId: tech.id,
    estimateHrs: between(2, 6), requiredSkill: skill,
  });
  addLine(wo.id, 'labor', wo.title, wo.estimateHrs, tech.billableRate, false);
}

// --- invoices ---------------------------------------------------------------
// Hook 4: overdue AR concentrated in Bayline Charters (~$12.4k, 45 days).
const invoices: Invoice[] = [];
let invN = 0;
function addInvoice(customerId: string, amount: number, issuedAgo: number, status: Invoice['status'], workOrderId?: string) {
  invN++;
  invoices.push({
    id: `INV-${String(invN).padStart(4, '0')}`,
    customerId, workOrderId,
    issuedDate: day(-issuedAgo), dueDate: day(-issuedAgo + 30),
    amount, status,
  });
}
addInvoice('C001', 12400, 45, 'overdue');
addInvoice('C004', 3180, 38, 'overdue');
addInvoice(customers[10].id, 1420, 34, 'overdue');
for (let i = 0; i < 24; i++) {
  addInvoice(pick(customers).id, between(300, 6200), between(35, 120), 'paid');
}
for (let i = 0; i < 6; i++) {
  addInvoice(pick(customers).id, between(400, 3800), between(3, 25), 'sent');
}

// --- write ------------------------------------------------------------------
const seed: SeedData = {
  anchorDate: ANCHOR_DATE,
  customers, boats, slips, technicians,
  workOrders, workOrderLines, parts, invoices,
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'seed.json'), JSON.stringify(seed, null, 2));

const unbilledTotal = workOrderLines
  .filter((l) => !l.billed && workOrders.find((w) => w.id === l.workOrderId)?.status === 'completed')
  .reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
console.log(`seed.json written: ${customers.length} customers, ${boats.length} boats, ${slips.length} slips, ${workOrders.length} work orders, ${invoices.length} invoices`);
console.log(`unbilled completed work: $${unbilledTotal.toLocaleString()}`);
