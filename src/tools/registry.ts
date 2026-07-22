// Single tool registry consumed by the assistant loop today and by an MCP
// server later (decision record A2/A4: one layer, many consumers). Read
// tools plus one draft action; the apply function lives outside the model's
// reach entirely.

import { draftInvoices } from './actions.js';
import { getOccupancy } from './occupancy.js';
import { getOvernightActivity } from './overnight.js';
import { getPartsBlockers } from './parts.js';
import { getReceivables } from './receivables.js';
import { getScheduleLoad } from './schedule.js';
import { getUnbilledWork } from './unbilled.js';
import { getWorkOrders, searchCustomers } from './lookup.js';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: object;
  handler: (input: any) => unknown;
}

const NO_ARGS = { type: 'object', properties: {}, required: [] };

export const TOOLS: ToolDef[] = [
  {
    name: 'search_customers',
    description:
      'Look up customers by customer or boat name; returns their boats, open work order count, and overdue balance. Call this when a question names a specific customer or boat.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Customer or boat name, full or partial' } },
      required: ['query'],
    },
    handler: searchCustomers,
  },
  {
    name: 'get_work_orders',
    description:
      'List work orders, optionally filtered by status (requested/estimated/approved/scheduled/in_progress/awaiting_parts/completed/invoiced) or customer name. Call this for questions about jobs, their status, or who is assigned.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Exact status filter' },
        customerName: { type: 'string', description: 'Customer name filter, partial ok' },
      },
      required: [],
    },
    handler: getWorkOrders,
  },
  {
    name: 'get_unbilled_work',
    description:
      'Completed work orders with unbilled labour and parts: per-job amounts, days since completion, and the total. Call this for questions about unbilled or uninvoiced work, revenue leakage, or "what have we finished but not charged for".',
    input_schema: NO_ARGS,
    handler: getUnbilledWork,
  },
  {
    name: 'get_schedule_load',
    description:
      'Technician demand vs capacity per skill per week (leave-aware), with the work orders driving demand. Call this for questions about the schedule, haul-outs, capacity, bottlenecks, or whether the yard can keep its commitments.',
    input_schema: {
      type: 'object',
      properties: { daysAhead: { type: 'number', description: 'Horizon in days, default 21' } },
      required: [],
    },
    handler: getScheduleLoad,
  },
  {
    name: 'get_parts_blockers',
    description:
      'Jobs waiting on parts whose purchase order arrives after the scheduled start, with the gap in days. Call this for questions about blocked jobs, parts, backorders, or why scheduled work will slip.',
    input_schema: NO_ARGS,
    handler: getPartsBlockers,
  },
  {
    name: 'get_receivables',
    description:
      'Overdue invoices by customer with days overdue and the total outstanding. Call this for questions about money owed, overdue accounts, or credit risk.',
    input_schema: NO_ARGS,
    handler: getReceivables,
  },
  {
    name: 'get_occupancy',
    description:
      'Slip occupancy and monthly revenue (actual vs potential) per dock, including dry stack. Call this for questions about vacancy, slip revenue, or where rental income is being left on the table.',
    input_schema: NO_ARGS,
    handler: getOccupancy,
  },
  {
    name: 'get_overnight_activity',
    description:
      'Recent bookings and job requests that arrived through non-staff channels: the Blu Voice Agent phone channel and the customer portal. Call this for "what came in overnight" or questions about the voice agent.',
    input_schema: NO_ARGS,
    handler: getOvernightActivity,
  },
  {
    name: 'draft_invoices',
    description:
      'Draft (but do not create) invoices for completed unbilled work orders — all of them, or a given list of work order IDs. Returns drafts that require human approval before anything is created. Call this when the user asks to invoice or bill completed work.',
    input_schema: {
      type: 'object',
      properties: {
        workOrderIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset of work order IDs' },
      },
      required: [],
    },
    handler: draftInvoices,
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function runTool(name: string, input: unknown): unknown {
  const tool = byName.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(input ?? {});
}
