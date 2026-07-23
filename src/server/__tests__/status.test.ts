import { describe, expect, it } from 'vitest';
import { createProviderHealth, recordStoreStatus, worstState } from '../status.js';

describe('worstState', () => {
  it('orders down > degraded > ok', () => {
    expect(worstState(['ok', 'ok'])).toBe('ok');
    expect(worstState(['ok', 'degraded'])).toBe('degraded');
    expect(worstState(['degraded', 'down', 'ok'])).toBe('down');
    expect(worstState([])).toBe('ok');
  });
});

describe('createProviderHealth', () => {
  const clock = (times: string[]) => {
    let i = 0;
    return () => times[Math.min(i++, times.length - 1)];
  };

  it('is ok with an honest detail before any request has been made', () => {
    const h = createProviderHealth();
    const s = h.status('gpt-4o-mini');
    expect(s.state).toBe('ok');
    expect(s.detail).toContain('no requests yet');
  });

  it('is ok after a successful request and reports when', () => {
    const h = createProviderHealth(clock(['2026-10-05T08:00:00Z']));
    h.recordSuccess();
    const s = h.status('gpt-4o-mini');
    expect(s.state).toBe('ok');
    expect(s.lastChecked).toBe('2026-10-05T08:00:00Z');
  });

  it('goes down when the most recent request failed', () => {
    const h = createProviderHealth(clock(['2026-10-05T08:00:00Z', '2026-10-05T08:01:00Z']));
    h.recordSuccess();
    h.recordError('connect ECONNREFUSED');
    const s = h.status('gpt-4o-mini');
    expect(s.state).toBe('down');
    expect(s.detail).toContain('ECONNREFUSED');
  });

  it('recovers to ok when a success follows the failure', () => {
    const h = createProviderHealth(clock(['2026-10-05T08:00:00Z', '2026-10-05T08:01:00Z']));
    h.recordError('boom');
    h.recordSuccess();
    expect(h.status('m').state).toBe('ok');
  });
});

describe('recordStoreStatus', () => {
  it('reports ok with collection counts from the seed', () => {
    const s = recordStoreStatus({ customers: [1, 2], workOrders: [1], invoices: [] } as any, '2026-10-05');
    expect(s.state).toBe('ok');
    expect(s.detail).toContain('2 customers');
    expect(s.detail).toContain('1 work orders');
  });
});
