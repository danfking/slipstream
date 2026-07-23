// Suggestion adoption counters (issue #3). In-memory on purpose: the metric's
// job in this prototype is to exist and be visible, proving the advisor-tier
// gate is instrumented — durability is the OTEL issue's problem (#4).
import { SUGGESTION_SOURCES } from '../assistant/suggest.js';

export type UsedKind = 'verbatim' | 'edited';

export interface MetricsSnapshot {
  suggestionsShown: number;
  suggestionsUsed: number;
  usedVerbatim: number;
  usedEdited: number;
  adoptionRate: number;
  bySource: Record<string, { shown: number; used: number }>;
}

export function createMetrics() {
  let shown = 0;
  let verbatim = 0;
  let edited = 0;
  const bySource = new Map<string, { shown: number; used: number }>();
  const bucket = (source: string) => {
    let b = bySource.get(source);
    if (!b) {
      b = { shown: 0, used: 0 };
      bySource.set(source, b);
    }
    return b;
  };

  return {
    recordShown(source: string) {
      if (!SUGGESTION_SOURCES.has(source)) return;
      shown++;
      bucket(source).shown++;
    },
    // Source arrives from a client header, so it is validated against the real
    // suggestion map — anything else is junk and must not pollute the metric.
    recordUsed(kind: UsedKind, source: string) {
      if (!SUGGESTION_SOURCES.has(source)) return;
      if (kind === 'verbatim') verbatim++;
      else edited++;
      bucket(source).used++;
    },
    snapshot(): MetricsSnapshot {
      const used = verbatim + edited;
      return {
        suggestionsShown: shown,
        suggestionsUsed: used,
        usedVerbatim: verbatim,
        usedEdited: edited,
        adoptionRate: shown === 0 ? 0 : used / shown,
        bySource: Object.fromEntries(bySource),
      };
    },
  };
}
