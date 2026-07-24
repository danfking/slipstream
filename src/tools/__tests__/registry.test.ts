import { describe, expect, it } from 'vitest';
import { db } from '../../data/store.js';
import { applyInvoiceDrafts, draftInvoices } from '../actions.js';
import { TOOLS, runTool } from '../registry.js';

describe('draft_invoices', () => {
  it('drafts every unbilled work order when unfiltered, without mutating', () => {
    // The deterministic guarantee behind issue #29: an empty filter bills the
    // whole eligible set (14 jobs, $16,419), so "draft all unbilled work" can
    // never silently drop a job as long as the model omits workOrderIds. This
    // runs first, before the apply tests below mutate the shared record.
    const before = db.invoices.length;
    const { drafts, totalAmount, requiresApproval } = draftInvoices({});
    expect(requiresApproval).toBe(true);
    expect(drafts.length).toBe(14);
    expect(totalAmount).toBe(16419);
    expect(db.invoices.length).toBe(before);
  });

  it('apply ignores tampered client amounts and recomputes from the record', () => {
    const draft = draftInvoices({}).drafts[0];
    const tampered = { ...draft, amount: 999999 };
    const { created } = applyInvoiceDrafts([tampered]);
    const invoice = db.invoices.find((i) => i.id === created[0])!;
    expect(invoice.amount).toBe(draft.amount);
    expect(invoice.amount).not.toBe(999999);
  });

  it('apply (server-side only) creates invoices and marks lines billed', () => {
    const first = draftInvoices({}).drafts[0];
    const { drafts } = draftInvoices({ workOrderIds: [first.workOrderId] });
    const before = db.invoices.length;
    const { created } = applyInvoiceDrafts(drafts);
    expect(created).toHaveLength(1);
    expect(db.invoices.length).toBe(before + 1);
    expect(draftInvoices({}).drafts.some((d) => d.workOrderId === first.workOrderId)).toBe(false);
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

  it('runTool rejects unknown tools', () => {
    expect(() => runTool('apply_invoice_drafts', {})).toThrow();
  });
});
