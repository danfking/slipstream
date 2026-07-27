# UI backlog

Findings from the agent critique rounds that were deliberately not fixed.
Recorded so they are decisions rather than oversights.

## Model behaviour, not UI

These come out of the model's wording and vary run to run. A UI fix would mean
templating the prose, which trades honesty for consistency; worth doing only if
a specific line has to be identical every run.

- **Repeat questions get re-phrased.** Asking the same question twice produces
  the same figures with different labels ("Dry stack (DS): 36" vs "Dry stack:
  36"). Considered caching identical consecutive questions; rejected because a
  cached answer is a worse lie than an inconsistent one.
- **Citation format is not guaranteed.** The system prompt asks for backticked
  tool names, which become chips. The model sometimes writes `[source: x]`
  instead, which renders as plain text. The chip is a nicety; the receipts
  panel is the trust mechanism.
- **Number/unit spacing** ("16hrs", "5 days") is inconsistent in model output.

## Deferred polish

- Status values in tables ("confirmed", "pending") are plain text; pills would
  make them scannable.
- Numeric table columns are left-aligned; right-aligned tabular figures would
  compare better.
- Dollar figures inside list items are unbolded while the headline is bold.
- The 14 created invoice IDs render as a wrapped comma list rather than a chip
  row.
- Receipt group labels are muted uppercase; BRAND.md specifies muted gray, and
  the current weight is slightly heavier than the documented idiom.
- The briefing answer can still run past the fold at 1280x720. Tightened
  spacing helps; a scroll affordance on the card would help more.

## Known gaps in coverage

- **No journey forces a genuinely slow reply.** The pending indicator's
  elapsed-seconds counter only appears after 3s, and every captured turn now
  settles faster than that on a warm model. The counter is therefore untested
  in a screenshot. It matters on a cold model, which is a real presentation
  risk; worth a manual check with a cold model before presenting.
- **Receipt dedup within a session is untested.** The approval journey reloads
  the page between the reject and approve passes, so two calls to the same tool
  in one session are never captured. If the panel collapses them by tool name,
  this would hide it.
- **No wide-table answer in core-qa.** Table scroll/wrap behaviour is exercised
  by the briefing and edges journeys but not deliberately.

## Accepted as-is

- The model badge in the header names the configured model openly (whatever
  `SLIPSTREAM_MODEL` is set to; `gpt-4o-mini` on the hosted app). Honest, and
  it matches the transparency the product argues for, though it invites a "why
  that model" question. That is a question for the presenter, not a UI defect.
- The gold "synthetic demo data" pill is permanent chrome rather than a
  transient highlight, which stretches the gold-is-for-attention rule. The
  disclosure is the one thing that must never be missed, so it keeps the gold.
