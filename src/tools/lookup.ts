import { boatById, customerById, db, techById } from '../data/store.js';
import { round2 } from './util.js';

const OPEN_STATUSES = ['requested', 'estimated', 'approved', 'scheduled', 'in_progress', 'awaiting_parts', 'completed'];

export function getWorkOrders(input: { status?: string; customerName?: string }) {
  const items = db.workOrders
    .filter((w) => (input.status ? w.status === input.status : true))
    .filter((w) =>
      input.customerName
        ? (customerById.get(w.customerId)?.name ?? '').toLowerCase().includes(input.customerName.toLowerCase())
        : true,
    )
    .slice(0, 40)
    .map((w) => ({
      workOrderId: w.id,
      title: w.title,
      status: w.status,
      category: w.category,
      priority: w.priority,
      customerName: customerById.get(w.customerId)?.name ?? w.customerId,
      technicianName: w.technicianId ? techById.get(w.technicianId)?.name : undefined,
      scheduledStart: w.scheduledStart,
      estimateHrs: w.estimateHrs,
    }));
  return { items };
}

export function searchCustomers(input: { query: string }) {
  const q = input.query.toLowerCase();
  const customers = db.customers
    .filter((c) => {
      const boats = db.boats.filter((b) => b.customerId === c.id);
      return c.name.toLowerCase().includes(q) || boats.some((b) => b.name.toLowerCase().includes(q));
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      boats: db.boats
        .filter((b) => b.customerId === c.id)
        .map((b) => ({ name: b.name, make: b.make, lengthFt: b.lengthFt, location: b.location })),
      openWorkOrders: db.workOrders.filter((w) => w.customerId === c.id && OPEN_STATUSES.includes(w.status)).length,
      overdueAmount: round2(
        db.invoices.filter((i) => i.customerId === c.id && i.status === 'overdue').reduce((s, i) => s + i.amount, 0),
      ),
    }));
  return { customers };
}
