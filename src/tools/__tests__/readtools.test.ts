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

  it('occupancy: premium C dock has vacancies while revenue potential exceeds actual', () => {
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

  it('customer search finds by name with overdue rollup', () => {
    const { customers } = searchCustomers({ query: 'bayline' });
    expect(customers).toHaveLength(1);
    expect(customers[0].overdueAmount).toBe(12400);
  });
});
