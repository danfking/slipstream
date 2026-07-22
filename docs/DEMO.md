# Demo run sheet

Open with the disclosure, every time: *"The marina is synthetic — modelled on DockMaster's public module structure, with the findings deliberately seeded so you can watch real behaviour on realistic pain. Today is 5 October in the data: mid haul-out season."*

Server up beforehand; `/api/health` badge visible in the header (model + date). Keep the receipts panel on screen throughout — it is the trust model, live.

## Scripted order

1. **Morning briefing** (button). Surfaces overnight Blu Voice Agent activity, the week's risk, and a money number, unprompted. Point at the receipts as it answers: "every figure came from one of these calls."
2. **GM seat:** `How much completed work haven't we billed yet?` → $16,419 across 14 jobs, oldest first. This is the revenue-leakage headline.
3. **Service manager seat:** `Can we keep up with the haul-out schedule over the next three weeks?` → week two: 54 hours of demand against 38 of capacity, 16 short, Ray's leave the cause. Cross-department by construction (work orders + technician roster + leave).
4. **Ecosystem moment:** `Anything come in overnight?` → two Blu Voice Agent bookings and an engine no-start phoned in overnight. Line: *"the partner owns the phone; the record owns the truth; this is where it becomes visible."*
5. **Blocked work:** `Which jobs are blocked waiting on parts? Flag any high-priority ones.` → six jobs, Bayline's charter boat the high-priority one, PO dates vs schedule dates.
6. **Approval gate:** `Draft invoices for all the unbilled completed work.` → drafts appear with Approve/Reject. Approve. Then ask question 2 again: the number moved. Line: *"the model never holds the pen — a person clicked that button."*
7. **Golden batch, live:** in a terminal, `npm run golden` → 10/10 with timings. Line: *"this runs on every release; accuracy is a number on a dashboard, not a feeling."*
8. If provider/vendor risk comes up: stop the server, restart with the Ollama env vars, ask question 2 again offline. Provider swap as config, demonstrated.

## Config on the day

- Primary: Anthropic, `claude-sonnet-5` (the recorded decision).
- Offline fallback (venue network failure, provider outage): `SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b` against local Ollama — golden batch passes 10/10 on this configuration too.
- Do not live-edit `golden.json` or the seed in the room.

## Authoring rule learned while building the golden batch

Assert substance, not phrasing: objective questions with exact-figure assertions (the numbers are what the trust model guarantees). Ambiguous judgment questions ("who's hurt most?") produce defensibly different answers run to run — keep those for conversation, not the test suite.
