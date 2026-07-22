import { ANCHOR_DATE, type TechSkill } from '../data/types.js';
import { addDays, db } from '../data/store.js';
import { round2 } from './util.js';

const SKILLS: TechSkill[] = ['haul', 'engine', 'electrical', 'rigging', 'fiberglass', 'detailing'];

function inRange(date: string, start: string, endExclusive: string): boolean {
  return date >= start && date < endExclusive;
}

function leaveWeekdaysIn(start: string, endExclusive: string, leave?: { start: string; end: string }): number {
  if (!leave) return 0;
  let count = 0;
  for (let d = start; d < endExclusive; d = addDays(d, 1)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow >= 1 && dow <= 5 && d >= leave.start && d <= leave.end) count++;
  }
  return count;
}

export function getScheduleLoad(input: { daysAhead?: number }) {
  const daysAhead = input.daysAhead ?? 21;
  const weeks = [];
  for (let offset = 0; offset < daysAhead; offset += 7) {
    const weekStart = addDays(ANCHOR_DATE, offset);
    const weekEnd = addDays(ANCHOR_DATE, offset + 7);
    const skills = SKILLS.map((skill) => {
      const workOrders = db.workOrders
        .filter(
          (w) =>
            w.requiredSkill === skill &&
            w.scheduledStart &&
            inRange(w.scheduledStart, weekStart, weekEnd) &&
            ['scheduled', 'approved', 'in_progress'].includes(w.status),
        )
        .map((w) => ({ workOrderId: w.id, title: w.title, scheduledStart: w.scheduledStart!, estimateHrs: w.estimateHrs }));
      const technicians = db.technicians
        .filter((t) => t.skills.includes(skill))
        .map((t) => {
          const onLeaveDays = leaveWeekdaysIn(weekStart, weekEnd, t.leave);
          return { name: t.name, capacityHrs: round2(t.weeklyCapacityHrs * (1 - onLeaveDays / 5)), onLeaveDays };
        });
      const demandHrs = round2(workOrders.reduce((s, w) => s + w.estimateHrs, 0));
      const capacityHrs = round2(technicians.reduce((s, t) => s + t.capacityHrs, 0));
      return {
        skill,
        demandHrs,
        capacityHrs,
        shortfallHrs: round2(Math.max(0, demandHrs - capacityHrs)),
        technicians,
        workOrders,
      };
    }).filter((s) => s.demandHrs > 0 || s.skill === 'haul');
    weeks.push({ weekStart, weekEnd: addDays(weekEnd, -1), skills });
  }
  return { weeks };
}
