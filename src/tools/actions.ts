// The one "write-shaped" tool. draftInvoices is model-callable and mutates
// nothing; applyInvoiceDrafts is the server-side apply behind the human
// approval gate and is deliberately NOT registered in the tool registry
// (decision record A5: the model never holds the pen).

import { ANCHOR_DATE } from '../data/types.js';
import { addDays, db, linesFor } from '../data/store.js';
import { getUnbilledWork } from './unbilled.js';
import { round2 } from './util.js';

export interface InvoiceDraft {
  workOrderId: string;
  customerName: string;
  description: string;
  amount: number;
}

let invSeq = 900;

// Companion to store.resetDb: the demo reset restores the counter too, so a
// re-run creates the same INV-901... ids and the every-run-is-identical claim
// stays true.
export function resetInvoiceSequence(): void {
  invSeq = 900;
}

export function draftInvoices(input: { workOrderIds?: string[] }) {
  const unbilled = getUnbilledWork().items;
  const selected = input.workOrderIds?.length
    ? unbilled.filter((i) => input.workOrderIds!.includes(i.workOrderId))
    : unbilled;
  const drafts: InvoiceDraft[] = selected.map((i) => ({
    workOrderId: i.workOrderId,
    customerName: i.customerName,
    description: `${i.title} (completed ${i.completedDate})`,
    amount: i.amount,
  }));
  return {
    drafts,
    totalAmount: round2(drafts.reduce((s, d) => s + d.amount, 0)),
    requiresApproval: true as const,
    note: 'These are drafts only. Nothing is created until a person approves them.',
  };
}

export function applyInvoiceDrafts(drafts: InvoiceDraft[]) {
  const created: string[] = [];
  for (const draft of drafts) {
    const wo = db.workOrders.find((w) => w.id === draft.workOrderId);
    if (!wo || wo.status !== 'completed') continue;
    // Recompute from the record — the client's amount is display-only and is
    // never trusted (trust model: every booked number comes from tested code).
    const amount = round2(
      linesFor(wo.id)
        .filter((l) => !l.billed)
        .reduce((s, l) => s + l.qty * l.unitPrice, 0),
    );
    invSeq++;
    const id = `INV-${invSeq}`;
    db.invoices.push({
      id,
      customerId: wo.customerId,
      workOrderId: wo.id,
      issuedDate: ANCHOR_DATE,
      dueDate: addDays(ANCHOR_DATE, 30),
      amount,
      status: 'sent',
    });
    for (const line of linesFor(wo.id)) line.billed = true;
    wo.status = 'invoiced';
    created.push(id);
  }
  return { created };
}
