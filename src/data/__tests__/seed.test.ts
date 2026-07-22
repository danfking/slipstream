import { describe, expect, it } from 'vitest';
import { db } from '../store.js';

describe('seed data', () => {
  it('contains Blu Voice Agent-originated overnight activity', () => {
    const bluReservations = db.reservations.filter((r) => r.source === 'blu_voice_agent');
    const bluWorkOrders = db.workOrders.filter((w) => w.source === 'blu_voice_agent');
    expect(bluReservations.length).toBeGreaterThanOrEqual(1);
    expect(bluWorkOrders.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults work order source to staff', () => {
    const staff = db.workOrders.filter((w) => w.source === 'staff');
    expect(staff.length).toBeGreaterThan(40);
  });
});
