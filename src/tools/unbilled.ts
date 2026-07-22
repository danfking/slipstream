import { ANCHOR_DATE } from '../data/types.js';
import { customerById, daysBetween, db, linesFor } from '../data/store.js';
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
      amount: round2(
        linesFor(w.id)
          .filter((l) => !l.billed)
          .reduce((s, l) => s + l.qty * l.unitPrice, 0),
      ),
    }))
    .sort((a, b) => b.daysSinceCompletion - a.daysSinceCompletion);
  return {
    items,
    itemCount: items.length,
    totalAmount: round2(items.reduce((s, i) => s + i.amount, 0)),
  };
}
