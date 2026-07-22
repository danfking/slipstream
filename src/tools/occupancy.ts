import { db } from '../data/store.js';
import { round2 } from './util.js';

export function getOccupancy() {
  const dockNames = [...new Set(db.slips.map((s) => s.dock))];
  const docks = dockNames.map((dock) => {
    const slips = db.slips.filter((s) => s.dock === dock);
    const occupied = slips.filter((s) => s.status === 'occupied');
    const revenue = (list: typeof slips) => round2(list.reduce((s, x) => s + x.monthlyRatePerFt * x.maxLengthFt, 0));
    return {
      dock,
      type: slips[0].type,
      total: slips.length,
      occupied: occupied.length,
      vacant: slips.filter((s) => s.status === 'vacant').length,
      monthlyRevenueActual: revenue(occupied),
      monthlyRevenuePotential: revenue(slips),
    };
  });
  return { docks };
}
