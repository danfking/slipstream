# Demo run sheet

Open with the disclosure, every time: *"The marina is synthetic — modelled on DockMaster's public module structure, with the findings deliberately seeded so you can watch real behaviour on realistic pain. Today is 5 October in the data: mid haul-out season."*

Server up beforehand; `/api/health` badge visible in the header (model + date). Keep the receipts panel on screen throughout — it is the trust model, live.

## Scripted order

1. **Morning briefing** (button). Surfaces overnight Blu Voice Agent activity, the week's risk, and a money number, unprompted. Point at the receipts as it answers: "every figure came from one of these calls." The `get_overnight_activity` receipt carries a gold **Blu Voice Agent** chip — that is the ecosystem line landing visually, so pause on it.
2. **GM seat:** `How much completed work haven't we billed yet?` → $16,419 across 14 jobs, oldest first. This is the revenue-leakage headline.
3. **Service manager seat:** `Can we keep up with the haul-out schedule over the next three weeks?` → week two: 54 hours of demand against 38 of capacity, 16 short, Ray's leave the cause. Cross-department by construction (work orders + technician roster + leave).
4. **Ecosystem moment:** `Anything come in overnight?` → two Blu Voice Agent bookings and an engine no-start phoned in overnight. Line: *"the partner owns the phone; the record owns the truth; this is where it becomes visible."*
5. **Blocked work:** `Which jobs are blocked waiting on parts? Flag any high-priority ones.` → six jobs, Bayline's charter boat the high-priority one, PO dates vs schedule dates.
6. **Approval gate:** `Draft invoices for all the unbilled completed work.` → drafts appear with Approve/Reject, under a fixed line reading "Nothing is created until you approve." Approve. Then ask question 2 again: the number moved. Line: *"the model never holds the pen — a person clicked that button."* If pressed on it, open the **APPROVED — CREATE INVOICES** receipt: the write is auditable on the same terms as every read.
7. **Golden batch, live:** in a terminal, `npm run golden` → 10/10 with timings. Line: *"this runs on every release; accuracy is a number on a dashboard, not a feeling."*
8. If provider/vendor risk comes up: stop the server, restart with the Ollama env vars, ask question 2 again offline. Provider swap as config, demonstrated.

## Before you start

Warm the model. A cold `gpt-oss:20b` takes 30-60s to first token; warm it is 2-8s. The pending indicator shows elapsed seconds so a slow answer reads as working rather than hung, but the shortest path is to run the briefing once before anyone is in the room.

If the provider drops, the failure is a designed state — an outlined card with a Try again button that resends the question. That frame is safe to show.

## Config on the day (booked: Tue 28 Jul 2026, 6:00am, Teams)

**Primary: the hosted app** — https://slipstream-dk.fly.dev (gpt-4o-mini on the server key, unlocked by passcode). One browser tab does everything: `/deck.html` for slides, the `live demo →` badge to switch, receipts panel visible throughout.

**Pre-call checklist (from about 5:45):**
1. Open the health URL — wakes the machine (it scales to zero when idle; first hit takes a few seconds).
2. Open the site, enter the passcode, ask one throwaway question. Confirms model + key + warm path end to end.
3. Run the golden batch against the hosted app in a terminal (`GOLDEN_URL=https://slipstream-dk.fly.dev GOLDEN_PASSCODE=... npm run golden`) — this is also demo moment 7, so a fresh 10/10 is ready to show.
4. Start the local hot spare: `SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b npm run dev` in the repo, briefing clicked once so the model is loaded. If Fly or OpenAI misbehaves mid-call, switch the shared tab to localhost:3000 and carry on — same app, same data, fully offline.
5. Deck open at slide 1, Teams sharing the browser window (not the screen).

- Do not live-edit `golden.json` or the seed in the room.
- If asked about the model: it's a setting — the hosted app runs a commercial mini-tier model, the hot spare runs a local open-weights model, same code.

## Authoring rule learned while building the golden batch

Assert substance, not phrasing: objective questions with exact-figure assertions (the numbers are what the trust model guarantees). Ambiguous judgment questions ("who's hurt most?") produce defensibly different answers run to run — keep those for conversation, not the test suite.
