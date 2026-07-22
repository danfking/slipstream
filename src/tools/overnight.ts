import { ANCHOR_DATE } from '../data/types.js';
import { customerById, daysBetween, db } from '../data/store.js';

const RECENT_DAYS = 2;

export function getOvernightActivity() {
  const recent = (date: string) => Math.abs(daysBetween(date, ANCHOR_DATE)) <= RECENT_DAYS;
  const reservations = db.reservations.filter((r) => r.source !== 'staff' && recent(r.createdDate));
  const workOrders = db.workOrders
    .filter((w) => w.source !== 'staff' && recent(w.requestedDate))
    .map((w) => ({
      workOrderId: w.id,
      title: w.title,
      customerName: customerById.get(w.customerId)?.name ?? w.customerId,
      priority: w.priority,
      source: w.source,
      notes: w.notes,
    }));
  return { reservations, workOrders };
}
