import { customerById, daysBetween, db, linesFor, partById } from '../data/store.js';

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
            workOrderId: w.id,
            title: w.title,
            customerName: customerById.get(w.customerId)?.name ?? w.customerId,
            priority: w.priority,
            scheduledStart: w.scheduledStart,
            partSku: part.sku,
            partDescription: part.description,
            onHand: part.onHand,
            onOrderQty: part.onOrderQty,
            poEta: part.poEta,
            gapDays: daysBetween(w.scheduledStart, part.poEta),
            notes: w.notes,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    )
    .sort((a, b) => b.gapDays - a.gapDays);
  return { items };
}
