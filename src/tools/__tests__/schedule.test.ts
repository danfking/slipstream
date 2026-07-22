import { describe, expect, it } from 'vitest';
import { getScheduleLoad } from '../schedule.js';

describe('getScheduleLoad', () => {
  it('shows a haul shortfall in week 2 (Ray on leave)', () => {
    const { weeks } = getScheduleLoad({ daysAhead: 21 });
    expect(weeks).toHaveLength(3);
    const week2Haul = weeks[1].skills.find((s) => s.skill === 'haul')!;
    expect(week2Haul.demandHrs).toBeGreaterThan(week2Haul.capacityHrs);
    expect(week2Haul.shortfallHrs).toBeGreaterThan(0);
    const ray = week2Haul.technicians.find((t) => t.name === 'Ray Delgado')!;
    expect(ray.onLeaveDays).toBe(5);
  });

  it('lists the scheduled work orders driving demand', () => {
    const { weeks } = getScheduleLoad({});
    const week2Haul = weeks[1].skills.find((s) => s.skill === 'haul')!;
    expect(week2Haul.workOrders.length).toBeGreaterThanOrEqual(10);
  });
});
