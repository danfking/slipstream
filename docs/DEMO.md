# Demo run sheet

Open with the disclosure, every time: *"The marina is synthetic, modelled on DockMaster's public module structure, with the findings deliberately seeded so you can watch real behaviour on realistic pain. Today is 5 October in the data: mid haul-out season."*

Server up beforehand; `/api/health` badge visible in the header (model + date). Keep the receipts panel on screen throughout: it is the trust model, live.

## Scripted order

1. **Morning briefing** (button). Surfaces overnight Blu Voice Agent activity, the week's risk, and a money number, unprompted. Point at the receipts as it answers: "every figure came from one of these calls." The `get_overnight_activity` receipt carries a gold **Blu Voice Agent** chip, the ecosystem line made visible, so pause on it.
2. **GM seat:** `How much completed work haven't we billed yet?` → $16,419 across 14 jobs, oldest first. This is the revenue-leakage headline.
3. **Service manager seat:** `Can we keep up with the haul-out schedule over the next three weeks?` → week two: 54 hours of demand against 38 of capacity, 16 short, Ray's leave the cause. Cross-department by construction (work orders + technician roster + leave).
4. **Ecosystem moment:** `Anything come in overnight?` → two Blu Voice Agent bookings and an engine no-start phoned in overnight. Line: *"the partner owns the phone; the record owns the truth; this is where it becomes visible."*
5. **Blocked work:** `Which jobs are blocked waiting on parts? Flag any high-priority ones.` → six jobs, Bayline's charter boat the high-priority one, PO dates vs schedule dates.
6. **Approval gate:** `Draft invoices for all the unbilled completed work.` → drafts appear with Approve/Reject, under a fixed line reading "Nothing is created until you approve." Approve. Then ask question 2 again: the number moved. Line: *"the model never holds the pen; a person clicked that button."* If pressed on it, open the **APPROVED / CREATE INVOICES** receipt: the write is auditable on the same terms as every read.
7. **Golden batch, live:** in a terminal, `npm run golden` → 13/13 with timings. Or run it from the UI: the "Golden batch" button in the receipts pane streams the same thirteen cases (figures and tool calls; the terminal run adds the lint gate), and each one expands to show what it asserts. Three of the thirteen are out-of-scope cases (weather, last year's unbilled total, insurance renewal) that assert the assistant *refuses* rather than reaching for the nearest tool. Line: *"this runs on every release; accuracy is a number on a dashboard, not a feeling."* If asked what the refusal cases are for: they caught a real defect. Asked for last year's unbilled work, the assistant answered this year's $16,419 and cited the tool, so the wrong answer arrived carrying a receipt.
8. If provider/vendor risk comes up: stop the server, restart with the Ollama env vars, ask question 2 again offline. Provider swap as config, demonstrated. (Requires a local model actually pulled in Ollama on the demo machine; check before promising it.)

## Before you start

Warm whichever model the hot spare runs. A cold local `gpt-oss:20b` takes 30-60s to first token; warm it is 2-8s. The hosted app cold-starts too (it scales to zero), so the first hit on the health URL wakes it. The pending indicator shows elapsed seconds so a slow answer reads as working rather than hung, but the shortest path is to run the briefing once on each before anyone is in the room.

If the provider drops, the failure is a designed state: an outlined card with a Try again button that resends the question. That frame is safe to show.

## Config on the day (booked: Tue 28 Jul 2026, 6:00am, Teams)

**Primary: the hosted app**, https://slipstream-dk.fly.dev (gpt-4o-mini on the server key, unlocked by passcode). One browser tab does everything: `/deck.html` for slides, the `live demo →` badge to switch, receipts panel visible throughout.

**Pre-call checklist (from about 5:45):**
1. Open the health URL to wake the machine (it scales to zero when idle; first hit takes a few seconds).
2. Open the site, enter the passcode, ask one throwaway question. Confirms model + key + warm path end to end.
3. Run the golden batch against the hosted app in a terminal. PowerShell, so `$env:GOLDEN_URL='https://slipstream-dk.fly.dev'; $env:GOLDEN_PASSCODE='...'; npm run golden` (the bash `VAR=x npm run` form does not work in this shell). This is also demo moment 7, so a fresh 13/13 is ready to show. Run it twice: `parts-blockers` is the one case with a history of intermittent failure (on the local open-weights model it failed whenever the model summarised without naming Bayline). On hosted `gpt-4o-mini` it has passed on every run so far, but the sample is small; a second run is the cheap insurance.

   The terminal batch is the *stricter* check. `scripts/golden.ts` also runs every reply through the markdown lint gate; the in-app modal (`/api/golden/run`) only checks figures and tool calls. So 13/13 in the modal does not guarantee 13/13 in the terminal. Run both before the call.
4. Start the local hot spare in the repo, briefing clicked once so it is warm. With Ollama and a pulled model: `SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b npm run dev` (fully offline). Without a local model, run the spare on the OpenAI key instead (not in the repo; in PowerShell: `$env:SLIPSTREAM_PROVIDER='openai'; $env:SLIPSTREAM_BASE_URL='https://api.openai.com/v1'; $env:SLIPSTREAM_PROVIDER_KEY=(Get-Content "$HOME\.slipstream-openai-key").Trim(); npm run dev`). Same app and data, still independent of Fly, but not offline. If Fly misbehaves mid-call, switch the shared tab to localhost:3000 and carry on.
5. Deck open at slide 1, Teams sharing the browser window (not the screen).

- Do not live-edit `golden.json` or the seed in the room.
- If asked about the model: it's a setting. The hosted app runs a commercial mini-tier model, the hot spare can run a local open-weights model, same code.

## Authoring rule learned while building the golden batch

Assert substance, not phrasing: objective questions with exact-figure assertions (the numbers are what the trust model guarantees). Ambiguous judgment questions ("who's hurt most?") produce defensibly different answers run to run. Keep those for conversation, not the test suite.
