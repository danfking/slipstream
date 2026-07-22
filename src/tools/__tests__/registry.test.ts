import { describe, expect, it } from 'vitest';
import { db } from '../../data/store.js';
import { applyInvoiceDrafts, draftInvoices } from '../actions.js';
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
