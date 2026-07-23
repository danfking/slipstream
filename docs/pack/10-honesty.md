# What's real and what's synthetic

### The data

The marina is synthetic. It is modelled on DockMaster's public module structure, set on a fixed date in haul-out season, and the findings the demo surfaces (unbilled work, a capacity crunch, blocked parts, overdue accounts) were seeded on purpose so you can watch real behaviour on realistic problems. Every run produces the same data, so what you saw is what anyone would see.

Where the demo touches partner products, it mocks their data trail, not the products themselves. Bookings from the Blu Voice Agent appear in the record with their source attributed. Nothing pretends to be Blu. One assumption to state plainly: if Blu does not yet write bookings into the record, building that integration is the obvious first piece of partnership work.

### Deliberately out of scope for the prototype

- Login and multi-tenant support
- Real synchronisation with the ERP (in production, the tool layer would sit on the real database the same way it sits on the demo data)
- Write actions beyond the approval-gated invoice flow
- Usage metering and billing

### Deferred on purpose

There is a written backlog separating two kinds of leftover work: model behaviour that varies run to run (accepted, because forcing identical wording would mean faking the answers) and interface polish (deferred, each item with a reason). Nothing was dropped silently.
