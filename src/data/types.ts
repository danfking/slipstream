// Domain model for the synthetic marina system of record.
// Modelled on the module structure of a marine ERP (marina management,
// service/work orders, parts inventory, financials). Snapshot date is
// ANCHOR_DATE: early October, mid haul-out season in the US north-east.

export const ANCHOR_DATE = '2026-10-05';

export type CustomerType = 'seasonal' | 'transient' | 'commercial';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: CustomerType;
  customerSince: string; // year
}

export type BoatLocation = 'wet_slip' | 'dry_stack' | 'on_hard' | 'offsite';

export interface Boat {
  id: string;
  customerId: string;
  name: string;
  make: string;
  lengthFt: number;
  kind: 'sail' | 'power';
  location: BoatLocation;
}

export interface Slip {
  id: string;
  dock: string; // A, B, C wet docks; DS dry stack
  number: number;
  maxLengthFt: number;
  type: 'wet' | 'dry_stack';
  monthlyRatePerFt: number;
  status: 'occupied' | 'vacant' | 'maintenance';
  boatId?: string;
}

export type TechSkill =
  | 'engine'
  | 'electrical'
  | 'rigging'
  | 'fiberglass'
  | 'detailing'
  | 'haul';

export interface Technician {
  id: string;
  name: string;
  skills: TechSkill[];
  billableRate: number; // $/hr charged to customer
  weeklyCapacityHrs: number;
  leave?: { start: string; end: string }; // inclusive dates
}

export type WorkOrderStatus =
  | 'requested'
  | 'estimated'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_parts'
  | 'completed'
  | 'invoiced';

export interface WorkOrder {
  id: string;
  boatId: string;
  customerId: string;
  title: string;
  category:
    | 'haul_out'
    | 'winterize'
    | 'engine'
    | 'electrical'
    | 'rigging'
    | 'fiberglass'
    | 'detailing'
    | 'shrink_wrap';
  status: WorkOrderStatus;
  priority: 'low' | 'normal' | 'high';
  requestedDate: string;
  scheduledStart?: string;
  completedDate?: string;
  technicianId?: string;
  estimateHrs: number;
  actualHrs?: number;
  requiredSkill: TechSkill;
  notes?: string;
}

export interface WorkOrderLine {
  id: string;
  workOrderId: string;
  kind: 'labor' | 'part';
  description: string;
  qty: number; // hours for labor lines
  partId?: string;
  unitPrice: number;
  billed: boolean;
}

export interface Part {
  id: string;
  sku: string;
  description: string;
  category: string;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  unitPrice: number;
  onOrderQty: number;
  poEta?: string; // expected arrival of open PO
}

export interface Invoice {
  id: string;
  customerId: string;
  workOrderId?: string;
  issuedDate: string;
  dueDate: string;
  amount: number;
  status: 'sent' | 'paid' | 'overdue';
}

export interface SeedData {
  anchorDate: string;
  customers: Customer[];
  boats: Boat[];
  slips: Slip[];
  technicians: Technician[];
  workOrders: WorkOrder[];
  workOrderLines: WorkOrderLine[];
  parts: Part[];
  invoices: Invoice[];
}
