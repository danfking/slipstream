# The honesty line

### What's synthetic

The marina is synthetic: modelled on DockMaster's public module structure, with a fixed anchor date in haul-out season and findings deliberately seeded (unbilled work, a capacity crunch, parts blockers, overdue receivables) so the demo shows real behaviour on realistic pain. Same input, same output, every run: no live-demo roulette.

Where the demo touches partner products, it mocks their **data trail**, not the products. Blu-originated bookings appear in the record with their source attributed; nothing pretends to be Blu. Assumption stated: if Blu doesn't yet write bookings into the record, that integration is the obvious first partnership work item.

### Deliberately out of scope for the prototype

- Authentication and multi-tenancy
- Real ERP synchronisation (the tool layer sits on the production database the same way it sits on the demo store)
- Production write paths beyond the approval-gated invoice flow
- Usage metering and billing

### Deferred by decision, not oversight

A recorded backlog separates model-behaviour variance (accepted: templating prose would trade honesty for consistency) from UI polish (deferred with reasons). Every deferral has a written rationale, the same discipline as the decision trail that opened this pack.
