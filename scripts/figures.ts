// Prints the engineered demo figures — used to author golden.json and DEMO.md.
import { getUnbilledWork } from '../src/tools/unbilled.js';
import { getScheduleLoad } from '../src/tools/schedule.js';
import { getOccupancy } from '../src/tools/occupancy.js';
import { getReceivables } from '../src/tools/receivables.js';
import { getPartsBlockers } from '../src/tools/parts.js';

const u = getUnbilledWork();
console.log('unbilled total:', u.totalAmount, 'items:', u.itemCount);
const w2 = getScheduleLoad({}).weeks[1].skills.find((x) => x.skill === 'haul')!;
console.log('week2 haul demand:', w2.demandHrs, 'capacity:', w2.capacityHrs, 'shortfall:', w2.shortfallHrs);
const c = getOccupancy().docks.find((d) => d.dock === 'C')!;
console.log('C dock vacant:', c.vacant, 'actual:', c.monthlyRevenueActual, 'potential:', c.monthlyRevenuePotential);
console.log('total overdue:', getReceivables().totalOverdue);
console.log('parts blockers:', getPartsBlockers().items.length);
