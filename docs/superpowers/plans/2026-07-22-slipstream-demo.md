# Slipstream Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live-demoable marina ops assistant: chat over a synthetic marina system of record via a typed tool layer, with receipts, a proactive briefing, one approval-gated action, and a runnable golden batch.

**Architecture:** All numbers come from deterministic tool functions over an in-memory store (`src/data/store.ts`); the model (Claude, manual tool-use loop) only chooses which tool to call and phrases answers. A shared tool registry feeds both the web app and (later) an MCP server. Read tools only, except one draft-action tool whose output requires human approval via the UI before it mutates anything.

**Tech Stack:** TypeScript (ESM, Node 22), Express 4, @anthropic-ai/sdk (manual loop — no beta dependency; registry is shared with a future MCP server), vitest, vanilla JS/HTML UI.

## Global Constraints

- Model is config: `SLIPSTREAM_MODEL` env var, default `"claude-sonnet-5"` (decision record A5). Never hardcode a model string outside `src/assistant/config.ts`.
- `ANTHROPIC_API_KEY` must be set for chat/golden; tool-layer tests must run without it.
- Every tool result returned to the UI verbatim as "receipts" — no tool output is hidden.
- Deterministic: no `Math.random`/`Date.now` in src; "today" is `ANCHOR_DATE` from `src/data/types.ts`.
- Demo queries must span ≥2 departments (decision record A6) — golden batch enforces this by construction.
- All money values are numbers in dollars, rounded to 2dp with `round2()` from `src/tools/util.ts`.

---

### Task 1: Seed extensions — Blu Voice Agent data trail

**Files:**
- Modify: `src/data/types.ts` (add `source` to WorkOrder; add `Reservation` interface; extend `SeedData`)
- Modify: `src/data/generate.ts` (source fields; Blu-originated reservation + work-order request)
- Test: `src/data/__tests__/seed.test.ts`

**Interfaces:**
- Produces: `WorkOrder.source: 'staff' | 'blu_voice_agent' | 'customer_portal'`; `Reservation { id, customerName, boatLengthFt, arrival, nights, slipId?, status: 'confirmed'|'pending', source, createdDate }`; `SeedData.reservations: Reservation[]`.

- [ ] **Step 1: Install vitest**

```bash
cd /c/Home/Projects/slipstream && npm install -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

```typescript
// src/data/__tests__/seed.test.ts
import { describe, expect, it } from 'vitest';
import { db } from '../store.js';

describe('seed data', () => {
  it('contains Blu Voice Agent-originated overnight activity', () => {
    const bluReservations = db.reservations.filter((r) => r.source === 'blu_voice_agent');
    const bluWorkOrders = db.workOrders.filter((w) => w.source === 'blu_voice_agent');
    expect(bluReservations.length).toBeGreaterThanOrEqual(1);
    expect(bluWorkOrders.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults work order source to staff', () => {
    const staff = db.workOrders.filter((w) => w.source === 'staff');
    expect(staff.length).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/__tests__/seed.test.ts`
Expected: FAIL (`reservations` undefined / `source` undefined).

- [ ] **Step 4: Implement**

In `src/data/types.ts` add:

```typescript
export type RecordSource = 'staff' | 'blu_voice_agent' | 'customer_portal';

export interface Reservation {
  id: string;
  customerName: string;
  boatLengthFt: number;
  arrival: string;
  nights: number;
  slipId?: string;
  status: 'confirmed' | 'pending';
  source: RecordSource;
  createdDate: string;
}
```

Add `source: RecordSource;` to `WorkOrder` and `reservations: Reservation[];` to `SeedData`.

In `src/data/generate.ts`: add `source: 'staff'` inside `addWO()` (spread `wo` after it so explicit sources can override: `const full = { id: …, source: 'staff' as const, ...wo };`). After the invoices section, add:

```typescript
// --- Blu Voice Agent overnight activity (decision record A6) ------------
const reservations: Reservation[] = [
  { id: 'R-001', customerName: 'Walk-up: Meredith Kane', boatLengthFt: 34, arrival: day(2), nights: 3, slipId: 'C-14', status: 'confirmed', source: 'blu_voice_agent', createdDate: day(0) },
  { id: 'R-002', customerName: 'Walk-up: Gordon Pryce', boatLengthFt: 41, arrival: day(1), nights: 2, status: 'pending', source: 'blu_voice_agent', createdDate: day(0) },
  { id: 'R-003', customerName: customers[15].name, boatLengthFt: 28, arrival: day(5), nights: 4, status: 'confirmed', source: 'customer_portal', createdDate: day(-1) },
];
const bluBoat = seasonalBoats[30];
addWO({
  boatId: bluBoat.id, customerId: bluBoat.customerId,
  title: `Engine won't start — ${bluBoat.name}`,
  category: 'engine', status: 'requested', priority: 'high',
  requestedDate: day(0), estimateHrs: 3, requiredSkill: 'engine',
  source: 'blu_voice_agent',
  notes: 'Phoned in overnight via Blu Voice Agent; customer says engine cranks but will not start.',
});
```

Import `Reservation` in the types import and add `reservations` to the written `SeedData` object. Then regenerate: `npm run seed`.

- [ ] **Step 5: Run tests, typecheck**

Run: `npm run seed && npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Blu Voice Agent data trail in seed (source fields, reservations)"
```

---

### Task 2: Tool util + get_unbilled_work

**Files:**
- Create: `src/tools/util.ts`, `src/tools/unbilled.ts`
- Test: `src/tools/__tests__/unbilled.test.ts`

**Interfaces:**
- Produces: `round2(n: number): number`; `getUnbilledWork(): { items: UnbilledItem[]; totalAmount: number; itemCount: number }` where `UnbilledItem = { workOrderId, title, customerName, completedDate, daysSinceCompletion, amount }`, sorted oldest-first.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tools/__tests__/unbilled.test.ts
import { describe, expect, it } from 'vitest';
import { db, lineTotal } from '../../data/store.js';
import { getUnbilledWork } from '../unbilled.js';

describe('getUnbilledWork', () => {
  it('totals unbilled lines on completed work orders', () => {
    const expected = db.workOrders
      .filter((w) => w.status === 'completed')
      .reduce((sum, w) => sum + lineTotal(w.id), 0);
    const result = getUnbilledWork();
    expect(result.totalAmount).toBeCloseTo(expected, 2);
    expect(result.totalAmount).toBeGreaterThan(10000); // engineered finding is material
  });

  it('sorts oldest completion first and computes days since', () => {
    const { items } = getUnbilledWork();
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0].daysSinceCompletion).toBeGreaterThanOrEqual(items[items.length - 1].daysSinceCompletion);
    expect(items[0].daysSinceCompletion).toBeGreaterThanOrEqual(28);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/tools/__tests__/unbilled.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/tools/util.ts
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

```typescript
// src/tools/unbilled.ts
import { ANCHOR_DATE } from '../data/types.js';
import { customerById, daysBetween, db, lineTotal, linesFor } from '../data/store.js';
import { round2 } from './util.js';

export interface UnbilledItem {
  workOrderId: string;
  title: string;
  customerName: string;
  completedDate: string;
  daysSinceCompletion: number;
  amount: number;
}

export function getUnbilledWork() {
  const items: UnbilledItem[] = db.workOrders
    .filter((w) => w.status === 'completed' && linesFor(w.id).some((l) => !l.billed))
    .map((w) => ({
      workOrderId: w.id,
      title: w.title,
      customerName: customerById.get(w.customerId)?.name ?? w.customerId,
      completedDate: w.completedDate!,
      daysSinceCompletion: daysBetween(w.completedDate!, ANCHOR_DATE),
      amount: round2(linesFor(w.id).filter((l) => !l.billed).reduce((s, l) => s + l.qty * l.unitPrice, 0)),
    }))
    .sort((a, b) => b.daysSinceCompletion - a.daysSinceCompletion);
  return {
    items,
    itemCount: items.length,
    totalAmount: round2(items.reduce((s, i) => s + i.amount, 0)),
  };
}
```

- [ ] **Step 4: Run to verify PASS** — `npx vitest run`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: get_unbilled_work tool"`

---

### Task 3: get_schedule_load (haul-out crunch)

**Files:**
- Create: `src/tools/schedule.ts`
- Test: `src/tools/__tests__/schedule.test.ts`

**Interfaces:**
- Consumes: `db`, `addDays`, `daysBetween`, `techById` from store; `ANCHOR_DATE`.
- Produces: `getScheduleLoad(input: { daysAhead?: number }): { weeks: WeekLoad[] }` where `WeekLoad = { weekStart: string; weekEnd: string; skills: SkillLoad[] }` and `SkillLoad = { skill, demandHrs, capacityHrs, shortfallHrs, technicians: { name, capacityHrs, onLeaveDays }[], workOrders: { workOrderId, title, scheduledStart, estimateHrs }[] }`. Weeks are 7-day buckets from ANCHOR_DATE; default `daysAhead` 21. Capacity: `weeklyCapacityHrs`, minus `weeklyCapacityHrs/5` per leave weekday in the bucket.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tools/__tests__/schedule.test.ts
import { describe, expect, it } from 'vitest';
import { getScheduleLoad } from '../schedule.js';

describe('getScheduleLoad', () => {
  it('shows a haul shortfall in week 2 (Ray on leave)', () => {
    const { weeks } = getScheduleLoad({ daysAhead: 21 });
    expect(weeks).toHaveLength(3);
    const week2Haul = weeks[1].skills.find((s) => s.skill === 'haul')!;
    expect(week2Haul.demandHrs).toBeGreaterThan(week2Haul.capacityHrs);
    expect(week2Haul.shortfallHrs).toBeGreaterThan(0);
    const ray = week2Haul.technicians.find((t) => t.name === 'Ray Delgado')!;
    expect(ray.onLeaveDays).toBe(5);
  });

  it('lists the scheduled work orders driving demand', () => {
    const { weeks } = getScheduleLoad({});
    const week2Haul = weeks[1].skills.find((s) => s.skill === 'haul')!;
    expect(week2Haul.workOrders.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/tools/schedule.ts
import { ANCHOR_DATE, type TechSkill } from '../data/types.js';
import { addDays, db } from '../data/store.js';
import { round2 } from './util.js';

const SKILLS: TechSkill[] = ['haul', 'engine', 'electrical', 'rigging', 'fiberglass', 'detailing'];

function inRange(date: string, start: string, endExclusive: string): boolean {
  return date >= start && date < endExclusive;
}

function leaveWeekdaysIn(start: string, endExclusive: string, leave?: { start: string; end: string }): number {
  if (!leave) return 0;
  let count = 0;
  for (let d = start; d < endExclusive; d = addDays(d, 1)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow >= 1 && dow <= 5 && d >= leave.start && d <= leave.end) count++;
  }
  return count;
}

export function getScheduleLoad(input: { daysAhead?: number }) {
  const daysAhead = input.daysAhead ?? 21;
  const weeks = [];
  for (let offset = 0; offset < daysAhead; offset += 7) {
    const weekStart = addDays(ANCHOR_DATE, offset);
    const weekEnd = addDays(ANCHOR_DATE, offset + 7);
    const skills = SKILLS.map((skill) => {
      const workOrders = db.workOrders
        .filter((w) => w.requiredSkill === skill && w.scheduledStart && inRange(w.scheduledStart, weekStart, weekEnd)
          && ['scheduled', 'approved', 'in_progress'].includes(w.status))
        .map((w) => ({ workOrderId: w.id, title: w.title, scheduledStart: w.scheduledStart!, estimateHrs: w.estimateHrs }));
      const technicians = db.technicians
        .filter((t) => t.skills.includes(skill))
        .map((t) => {
          const onLeaveDays = leaveWeekdaysIn(weekStart, weekEnd, t.leave);
          return { name: t.name, capacityHrs: round2(t.weeklyCapacityHrs * (1 - onLeaveDays / 5)), onLeaveDays };
        });
      const demandHrs = round2(workOrders.reduce((s, w) => s + w.estimateHrs, 0));
      const capacityHrs = round2(technicians.reduce((s, t) => s + t.capacityHrs, 0));
      return { skill, demandHrs, capacityHrs, shortfallHrs: round2(Math.max(0, demandHrs - capacityHrs)), technicians, workOrders };
    }).filter((s) => s.demandHrs > 0 || s.skill === 'haul');
    weeks.push({ weekStart, weekEnd: addDays(weekEnd, -1), skills });
  }
  return { weeks };
}
```

Note: if the week-2 shortfall assertion fails because seeded demand lands differently than expected, fix the **seed** (shift more haul-outs into days 7-13 in `generate.ts`), not the test — the crunch is an engineered finding (decision record A6).

- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: get_schedule_load with leave-aware capacity"`

---

### Task 4: Remaining read tools (parts, receivables, occupancy, overnight, work orders, customers)

**Files:**
- Create: `src/tools/parts.ts`, `src/tools/receivables.ts`, `src/tools/occupancy.ts`, `src/tools/overnight.ts`, `src/tools/lookup.ts`
- Test: `src/tools/__tests__/readtools.test.ts`

**Interfaces (all produced here, consumed by Task 5):**
- `getPartsBlockers(): { items: { workOrderId, title, customerName, priority, scheduledStart, partSku, partDescription, onHand, onOrderQty, poEta, gapDays, notes? }[] }` — awaiting_parts WOs joined to their zero/short-stock part lines; `gapDays = daysBetween(scheduledStart, poEta)` (positive = PO lands after schedule).
- `getReceivables(): { overdue: { invoiceId, customerName, amount, issuedDate, dueDate, daysOverdue }[]; totalOverdue: number }` — status 'overdue', sorted largest first; `daysOverdue = daysBetween(dueDate, ANCHOR_DATE)`.
- `getOccupancy(): { docks: { dock, type, total, occupied, vacant, monthlyRevenueActual, monthlyRevenuePotential }[] }` — revenue = sum over slips of `monthlyRatePerFt * maxLengthFt` (potential) / occupied only (actual).
- `getOvernightActivity(): { reservations: Reservation[]; workOrders: { workOrderId, title, customerName, priority, source, notes? }[] }` — records with `source !== 'staff'` and createdDate/requestedDate within 2 days of ANCHOR_DATE.
- `getWorkOrders(input: { status?: string; customerName?: string }): { items: {...}[] }` — filtered list, ≤40 items, each with id/title/status/customerName/technicianName/scheduledStart/estimateHrs/category/priority.
- `searchCustomers(input: { query: string }): { customers: { id, name, type, boats: { name, make, lengthFt, location }[], openWorkOrders: number, overdueAmount: number }[] }` — case-insensitive substring on customer or boat name.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/tools/__tests__/readtools.test.ts
import { describe, expect, it } from 'vitest';
import { getPartsBlockers } from '../parts.js';
import { getReceivables } from '../receivables.js';
import { getOccupancy } from '../occupancy.js';
import { getOvernightActivity } from '../overnight.js';
import { searchCustomers } from '../lookup.js';

describe('read tools', () => {
  it('parts blockers: PO arrives after schedule, Bayline flagged high priority', () => {
    const { items } = getPartsBlockers();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.gapDays > 0)).toBe(true);
    expect(items.some((i) => i.customerName.includes('Bayline') && i.priority === 'high')).toBe(true);
  });

  it('receivables: Bayline is the largest overdue account', () => {
    const { overdue, totalOverdue } = getReceivables();
    expect(overdue[0].customerName).toContain('Bayline');
    expect(overdue[0].amount).toBe(12400);
    expect(totalOverdue).toBeGreaterThan(15000);
  });

  it('occupancy: premium C dock has vacancies while dry stack is full or near-full', () => {
    const { docks } = getOccupancy();
    const c = docks.find((d) => d.dock === 'C')!;
    expect(c.vacant).toBeGreaterThanOrEqual(4);
    expect(c.monthlyRevenuePotential).toBeGreaterThan(c.monthlyRevenueActual);
  });

  it('overnight activity surfaces Blu-originated records', () => {
    const { reservations, workOrders } = getOvernightActivity();
    expect(reservations.some((r) => r.source === 'blu_voice_agent')).toBe(true);
    expect(workOrders.some((w) => w.source === 'blu_voice_agent')).toBe(true);
  });

  it('customer search finds by boat name', () => {
    const { customers } = searchCustomers({ query: 'bayline' });
    expect(customers).toHaveLength(1);
    expect(customers[0].overdueAmount).toBe(12400);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement the five files.** Each follows the same shape as `unbilled.ts`: import from `../data/store.js`, filter/join/sort, `round2` money. Full example for the trickiest join:

```typescript
// src/tools/parts.ts
import { customerById, daysBetween, db, partById, linesFor } from '../data/store.js';

export function getPartsBlockers() {
  const items = db.workOrders
    .filter((w) => w.status === 'awaiting_parts')
    .flatMap((w) =>
      linesFor(w.id)
        .filter((l) => l.kind === 'part' && l.partId)
        .map((l) => {
          const part = partById.get(l.partId!)!;
          if (part.onHand >= l.qty || !part.poEta || !w.scheduledStart) return null;
          return {
            workOrderId: w.id, title: w.title,
            customerName: customerById.get(w.customerId)?.name ?? w.customerId,
            priority: w.priority, scheduledStart: w.scheduledStart,
            partSku: part.sku, partDescription: part.description,
            onHand: part.onHand, onOrderQty: part.onOrderQty, poEta: part.poEta,
            gapDays: daysBetween(w.scheduledStart, part.poEta),
            notes: w.notes,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    )
    .sort((a, b) => b.gapDays - a.gapDays);
  return { items };
}
```

Write `receivables.ts`, `occupancy.ts`, `overnight.ts`, `lookup.ts` (both `getWorkOrders` and `searchCustomers` in `lookup.ts`) to the exact signatures in the Interfaces block above.

- [ ] **Step 4: Run to verify PASS** — `npx vitest run` (all suites).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: parts/receivables/occupancy/overnight/lookup read tools"`

---

### Task 5: Draft-invoice action tool + tool registry

**Files:**
- Create: `src/tools/actions.ts`, `src/tools/registry.ts`
- Test: `src/tools/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `draftInvoices(input: { workOrderIds?: string[] }): { drafts: InvoiceDraft[]; requiresApproval: true; note: string }` where `InvoiceDraft = { workOrderId, customerName, description, amount }` — **no mutation**; defaults to all unbilled completed WOs.
- Produces: `applyInvoiceDrafts(drafts: InvoiceDraft[]): { created: string[] }` — appends `Invoice` rows to `db.invoices` (issued ANCHOR_DATE, due +30, status 'sent') and marks the WO lines billed + WO status 'invoiced'. Exported for the server's approval endpoint only — **not** in the registry (the model cannot call it; A5 trust model).
- Produces: `TOOLS: ToolDef[]` and `runTool(name: string, input: unknown): unknown`, where `ToolDef = { name, description, input_schema: object, handler: (input: any) => unknown }`. Registry contains exactly: `search_customers`, `get_work_orders`, `get_unbilled_work`, `get_schedule_load`, `get_parts_blockers`, `get_receivables`, `get_occupancy`, `get_overnight_activity`, `draft_invoices`. Descriptions must state *when* to call each tool.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tools/__tests__/registry.test.ts
import { describe, expect, it } from 'vitest';
import { db } from '../../data/store.js';
import { draftInvoices, applyInvoiceDrafts } from '../actions.js';
import { TOOLS, runTool } from '../registry.js';

describe('draft_invoices', () => {
  it('drafts without mutating', () => {
    const before = db.invoices.length;
    const { drafts, requiresApproval } = draftInvoices({});
    expect(requiresApproval).toBe(true);
    expect(drafts.length).toBeGreaterThanOrEqual(10);
    expect(db.invoices.length).toBe(before);
  });

  it('apply (server-side only) creates invoices and marks lines billed', () => {
    const { drafts } = draftInvoices({ workOrderIds: [draftInvoices({}).drafts[0].workOrderId] });
    const before = db.invoices.length;
    const { created } = applyInvoiceDrafts(drafts);
    expect(created).toHaveLength(1);
    expect(db.invoices.length).toBe(before + 1);
  });
});

describe('registry', () => {
  it('exposes read tools + draft action, never apply', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('get_unbilled_work');
    expect(names).toContain('draft_invoices');
    expect(names).not.toContain('apply_invoice_drafts');
    expect(TOOLS.every((t) => t.description.length > 40)).toBe(true);
  });

  it('runTool dispatches', () => {
    const result = runTool('get_receivables', {}) as { totalOverdue: number };
    expect(result.totalOverdue).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** `actions.ts` per the interface (drafts from `getUnbilledWork()` items; apply pushes invoices `INV-9xx` sequence). Implement `registry.ts` as a literal array wiring each tool: `{ name, description, input_schema: { type: 'object', properties: {...}, required: [...] }, handler }`. Schemas: `search_customers` requires `query` (string); `get_work_orders` optional `status`, `customerName`; `get_schedule_load` optional `daysAhead` (number); `draft_invoices` optional `workOrderIds` (string[]); the rest take `{}`. Every description ends with a "Call this when…" sentence.
- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: draft-invoice action + tool registry (apply excluded from model)"`

---

### Task 6: Assistant loop (Claude, manual tool-use loop, injectable client)

**Files:**
- Create: `src/assistant/config.ts`, `src/assistant/system.ts`, `src/assistant/chat.ts`
- Test: `src/assistant/__tests__/chat.test.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk` dependency)

**Interfaces:**
- Produces: `MODEL` (from `SLIPSTREAM_MODEL`, default `"claude-sonnet-5"`), `SYSTEM_PROMPT` (string, includes ANCHOR_DATE as "today", marina name, receipts/verifiability instruction, "answer only from tool results — never invent numbers").
- Produces: `runChat(client: ChatClient, messages: ChatMessage[]): Promise<{ reply: string; toolEvents: ToolEvent[] }>` where `ChatMessage = { role: 'user'|'assistant'; content: string }`, `ToolEvent = { name: string; input: unknown; result: unknown }`, and `ChatClient = { create(params: object): Promise<any> }` (structural subset of `client.messages`, so tests inject a stub and the server passes `new Anthropic().messages`).
- Loop: max 8 iterations; on `stop_reason === 'tool_use'` execute every `tool_use` block via `runTool`, append assistant content + one user message with all `tool_result` blocks (JSON.stringify results); on error inside a tool return `is_error: true` with the message; collect ToolEvents in call order; return final text.

- [ ] **Step 1: Install SDK** — `npm install @anthropic-ai/sdk`
- [ ] **Step 2: Write the failing test**

```typescript
// src/assistant/__tests__/chat.test.ts
import { describe, expect, it } from 'vitest';
import { runChat } from '../chat.js';

function stubClient(turns: any[]) {
  let i = 0;
  return { create: async () => turns[i++] };
}

describe('runChat', () => {
  it('executes tool calls and returns tool events + final text', async () => {
    const client = stubClient([
      { stop_reason: 'tool_use', content: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', id: 't1', name: 'get_receivables', input: {} },
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have overdue invoices.' }] },
    ]);
    const { reply, toolEvents } = await runChat(client, [{ role: 'user', content: 'Who owes us money?' }]);
    expect(reply).toBe('You have overdue invoices.');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].name).toBe('get_receivables');
    expect((toolEvents[0].result as any).totalOverdue).toBeGreaterThan(0);
  });

  it('survives an unknown tool with is_error rather than throwing', async () => {
    const client = stubClient([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'nope', input: {} }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry.' }] },
    ]);
    const { reply } = await runChat(client, [{ role: 'user', content: 'x' }]);
    expect(reply).toBe('Sorry.');
  });
});
```

- [ ] **Step 3: Run to verify FAIL.**
- [ ] **Step 4: Implement** `config.ts` (`export const MODEL = process.env.SLIPSTREAM_MODEL ?? 'claude-sonnet-5';` + `MAX_TOKENS = 2048`), `system.ts`, and `chat.ts`:

```typescript
// src/assistant/chat.ts
import { MODEL, MAX_TOKENS } from './config.js';
import { SYSTEM_PROMPT } from './system.js';
import { TOOLS, runTool } from '../tools/registry.js';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ToolEvent { name: string; input: unknown; result: unknown }
export interface ChatClient { create(params: object): Promise<any> }

const apiTools = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export async function runChat(client: ChatClient, messages: ChatMessage[]) {
  const convo: any[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolEvents: ToolEvent[] = [];
  for (let i = 0; i < 8; i++) {
    const response = await client.create({
      model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, tools: apiTools, messages: convo,
    });
    if (response.stop_reason !== 'tool_use') {
      const reply = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      return { reply, toolEvents };
    }
    convo.push({ role: 'assistant', content: response.content });
    const results = response.content
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => {
        try {
          const result = runTool(b.name, b.input);
          toolEvents.push({ name: b.name, input: b.input, result });
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) };
        } catch (err) {
          return { type: 'tool_result', tool_use_id: b.id, content: String(err), is_error: true };
        }
      });
    convo.push({ role: 'user', content: results });
  }
  return { reply: 'I could not complete that within my step limit.', toolEvents };
}
```

- [ ] **Step 5: Run to verify PASS** (no API key needed — stub only).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: assistant loop with injectable client"`

---

### Task 7: Express server (chat, briefing, approval, health)

**Files:**
- Create: `src/server.ts`
- Modify: `package.json` (add `express`, `@types/express`; script `"dev": "tsx src/server.ts"`)

**Interfaces:**
- `GET /api/health` → `{ ok: true, model: MODEL, anchorDate: ANCHOR_DATE }`
- `POST /api/chat` body `{ messages: ChatMessage[] }` → `{ reply, toolEvents }` (real Anthropic client: `const anthropic = new Anthropic(); runChat({ create: (p) => anthropic.messages.create(p as any) }, messages)`)
- `GET /api/briefing` → `{ reply, toolEvents }` — `runChat` with the fixed user message: `"Give me the morning briefing: overnight activity, this week's biggest operational risk, and the one financial number I should act on today. Be specific and cite figures."`
- `POST /api/approve` body `{ drafts: InvoiceDraft[] }` → `applyInvoiceDrafts(drafts)` result.
- Static: `express.static('web')` at `/`. Port `process.env.PORT ?? 3000`.

- [ ] **Step 1: Implement `src/server.ts`** (JSON body middleware, four routes, error handler returning `{ error: string }` with status 500).
- [ ] **Step 2: Smoke test** — `npm run dev &` then `curl -s localhost:3000/api/health`. Expected: `{"ok":true,...}`. Then with `ANTHROPIC_API_KEY` set: `curl -s localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"How much completed work is unbilled?"}]}'` — expect a reply citing a dollar figure ≈ the `getUnbilledWork().totalAmount` and a `get_unbilled_work` tool event.
- [ ] **Step 3: Typecheck + full tests** — `npm run typecheck && npx vitest run`.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: express server (chat, briefing, approve, health)"`

---

### Task 8: Chat UI with receipts and approval gate

**Files:**
- Create: `web/index.html`, `web/app.js`, `web/style.css`

**Interfaces:**
- Consumes: the four endpoints from Task 7 exactly as specified.

Layout: header ("Slipstream — Harborview Marina & Boatyard · today = anchor date · model badge from /api/health"); left 2/3 chat pane with input; right 1/3 "Receipts" panel listing each tool event of the latest reply (`name`, pretty-printed input, collapsible JSON result); "Morning briefing" button above chat that calls `/api/briefing` and renders the reply as the first assistant message. When any tool event's result has `requiresApproval: true`, render an approval card in the chat: table of drafts (customer, description, amount, total) with **Approve** / **Reject** buttons; Approve posts drafts to `/api/approve` and appends a confirmation line; Reject just dismisses. Keep conversation state client-side (array of `{role, content}` resent each turn). No frameworks; fetch + DOM. Dark-on-light, system font stack, readable at projector resolution (16px+).

- [ ] **Step 1: Implement the three files.**
- [ ] **Step 2: Manual verification** — `npm run dev`, open `localhost:3000`: (a) briefing button produces a briefing with receipts; (b) "what's blocking this week's haul-outs?" answers with schedule figures and shows `get_schedule_load` receipt; (c) "draft invoices for the unbilled work" produces the approval card; approving reports invoices created; asking "what's unbilled?" again shows the total dropped.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: chat UI with receipts panel and approval gate"`

---

### Task 9: Golden batch

**Files:**
- Create: `golden/golden.json`, `scripts/golden.ts`
- Modify: `package.json` (script `"golden": "tsx scripts/golden.ts"`)

**Interfaces:**
- `golden.json`: array of `{ id: string; question: string; mustInclude: string[]; mustCallTool: string }`. Ten entries covering: unbilled total (mustInclude the exact dollar figure from `getUnbilledWork()` — compute once and paste at authoring time), haul-out week-2 shortfall + Ray's leave, Bayline parts blocker, Bayline overdue $12,400, C-dock vacancies, overnight Blu items, customer lookup, tiered cross-department question ("which customers with overdue invoices also have boats blocked on parts?" → both tools), work-order status filter, occupancy revenue gap.
- `scripts/golden.ts`: for each entry, call `runChat` with the real client, assert every `mustInclude` substring (case/comma-insensitive normalization: strip `,` and lowercase) appears in the reply and `mustCallTool` appears in toolEvents; print a PASS/FAIL table and totals; `process.exit(1)` on any failure. Print total token-ish cost note is out of scope.

- [ ] **Step 1: Author `golden.json`** — compute the current engineered figures first: `npx tsx -e "import('./src/tools/unbilled.js').then(m => console.log(m.getUnbilledWork().totalAmount))"` and equivalents for the schedule shortfall and receivables; paste real values into `mustInclude`.
- [ ] **Step 2: Implement `scripts/golden.ts`** per the interface.
- [ ] **Step 3: Run** — `npm run golden` with API key set. Expected: 10/10 PASS. Where a failure is model phrasing (right number, different format), loosen the normalization, not the substance.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: golden batch — ten asserted questions run end-to-end"`

---

### Task 10: README and demo run notes

**Files:**
- Create: `README.md`, `docs/DEMO.md`

README: what Slipstream is (two sentences, decision-record positioning), quickstart (`npm install && npm run seed && ANTHROPIC_API_KEY=… npm run dev`), architecture diagram in ASCII (record → tool layer → {assistant, golden batch, future MCP/partners}), the trust model in five lines, what's deliberately out of scope (A6 list). `docs/DEMO.md`: the scripted demo order (briefing → GM question → service-manager question → Blu overnight → approval gate → golden batch live), with the exact queries to type.

- [ ] **Step 1: Write both files.**
- [ ] **Step 2: Clean-machine check** — `git clean -n` to confirm nothing untracked is needed; verify quickstart works from the README text alone.
- [ ] **Step 3: Commit + push** — `git add -A && git commit -m "docs: README + demo run notes" && git push`

---

## Self-Review

- **Spec coverage:** A2/A3 anchors (unbilled + haul-out queries) → Tasks 2, 3, 9; A5 trust model (read-only registry, apply outside model reach, golden batch) → Tasks 5, 9; A5 model-as-config → Task 6; A6 demo moments (briefing, approval gate, Blu overnight, receipts, disclosure) → Tasks 1, 7, 8; A6 golden-batch-shown-live → Task 9; cross-department rule → golden entry 8. GTM pack is Phase C, deliberately not in this plan.
- **Placeholders:** Task 4 batches five similar files behind one full exemplar + exact interface signatures; Task 8 is UI described to spec without JS listings (manual-verification task). Accepted trade-offs, flagged here.
- **Type consistency:** `ToolEvent`/`ChatMessage`/`InvoiceDraft`/`ToolDef` names checked across Tasks 5-9.
