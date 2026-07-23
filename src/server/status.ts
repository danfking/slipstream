// Service status (issue #5). Operational transparency is part of the trust
// story: receipts for answers, status for infrastructure. Provider health is
// tracked from real request outcomes (no synthetic probe traffic); the record
// store reports its seed; Blu webhook and telemetry are honest mocks, labelled
// as such, giving the provider-swap demo moment a visible home.

export type ServiceState = 'ok' | 'degraded' | 'down';

export interface ServiceStatus {
  name: string;
  state: ServiceState;
  lastChecked: string;
  detail: string;
}

const RANK: Record<ServiceState, number> = { ok: 0, degraded: 1, down: 2 };

export function worstState(states: ServiceState[]): ServiceState {
  return states.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'ok' as ServiceState);
}

/** Tracks the model provider from actual request outcomes. */
export function createProviderHealth(now: () => string = () => new Date().toISOString()) {
  // Call order, not timestamp comparison, decides the state: two outcomes in
  // the same millisecond produce equal ISO strings, and last-outcome-wins is
  // the semantics we actually mean. Timestamps are display-only.
  let lastOutcome: 'ok' | 'error' | null = null;
  let lastAt: string | null = null;
  let lastMessage = '';
  return {
    recordSuccess() {
      lastOutcome = 'ok';
      lastAt = now();
    },
    recordError(message: string) {
      lastOutcome = 'error';
      lastAt = now();
      lastMessage = String(message).slice(0, 200);
    },
    status(model: string): ServiceStatus {
      const name = 'Model provider';
      if (lastOutcome === 'error') {
        return { name, state: 'down', lastChecked: lastAt!, detail: `${model}: last request failed (${lastMessage})` };
      }
      if (lastOutcome === 'ok') {
        return { name, state: 'ok', lastChecked: lastAt!, detail: `${model}: last request succeeded` };
      }
      return { name, state: 'ok', lastChecked: now(), detail: `${model}: no requests yet this session` };
    },
  };
}

export function recordStoreStatus(db: Record<string, unknown>, anchorDate: string): ServiceStatus {
  const counts = ['customers', 'boats', 'slips', 'workOrders', 'parts', 'invoices', 'reservations']
    .filter((k) => Array.isArray(db[k]))
    .map((k) => `${(db[k] as unknown[]).length} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
    .join(', ');
  return {
    name: 'Record store',
    state: 'ok',
    lastChecked: new Date().toISOString(),
    detail: `Seed loaded (anchor ${anchorDate}): ${counts}`,
  };
}
