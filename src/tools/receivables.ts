import { ANCHOR_DATE } from '../data/types.js';
import { customerById, daysBetween, db } from '../data/store.js';
import { round2 } from './util.js';

export function getReceivables() {
  const overdue = db.invoices
    .filter((i) => i.status === 'overdue')
    .map((i) => ({
      invoiceId: i.id,
      customerName: customerById.get(i.customerId)?.name ?? i.customerId,
      amount: round2(i.amount),
      issuedDate: i.issuedDate,
      dueDate: i.dueDate,
      daysOverdue: daysBetween(i.dueDate, ANCHOR_DATE),
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    overdue,
    totalOverdue: round2(overdue.reduce((s, i) => s + i.amount, 0)),
  };
}
