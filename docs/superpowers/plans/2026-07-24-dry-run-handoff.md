# Handoff: 24 Jul 2026 -> next session (dry run)

Resuming from another PC. Everything below is merged to `main` and deployed to
`slipstream-dk.fly.dev`. This file is the cross-machine bridge; pull `main` first.

## Where the demo is (feature-complete)

Built and shipped this session, all on `main`:

- Progressive response streaming (SSE + idiomorph).
- Suggestion / adoption gate: contextual next-question in the input, Tab to
  accept, take-up measured at `/api/metrics` (the Advisor-tier gate, live).
- Service status page (`/status.html`) and header status dot.
- Synthetic-data browser (`/data.html`) behind the demo-data pill, filter pills.
- OpenTelemetry tracing (chat turns, tool calls, token usage; console exporter,
  OTLP via env).
- Accuracy checks run FROM THE UI: "Accuracy checks" button in the receipts
  pane -> modal streams the golden batch green (`/api/golden/run`). 10/10 on
  gpt-4o-mini.
- Two-mode deck (`/deck.html`): reading (detail, default) vs talk (`p` key /
  "talk view" button), print = detail. Plus DockMaster-idiom visuals (topic
  icon chips, numbered step badges, gold markers) in both views.
- Logo: three bars navy/gold/navy (DockMaster favicon style) on a WHITE header
  with navy text (DockMaster white-chrome look); favicon navy bars for the tab.
- Trust fixes: fabrication guardrails, briefing runs history-free, draft-all
  reliability, request-error hardening.

Tests: 211 vitest + 54 pack gates green. Golden batch 10/10 (gpt-4o-mini).

## Running it on the other PC

- Local Ollama no longer has `gpt-oss:20b` / `qwen3:4b` (only gemma/deepseek/
  codellama in the default store; no OLLAMA_MODELS var). So local gpt-oss is
  gone unless re-pulled.
- This machine's local server runs on Dan's OpenAI key via a file bridge
  (`~/.slipstream-openai-key`) + a launch script that reads it (key never in
  chat). That key file and script are THIS machine only.
- For the dry run, present on **hosted** (`slipstream-dk.fly.dev`, gpt-4o-mini).
  It cold-starts on the first hit, so warm it a few minutes before. No local
  setup needed.

## Next step: the dry run

Conversational, not code. The assistant plays **Andrey Safonov** (Aspire AI
lead, ex-Head of Product at DockMaster; the case is his old product; his filter
is real software vs vibe-coded prototype). Grill Dan against:

- the deck (`/deck.html`, both reading and talk views),
- the live app (hosted), and
- the decision record (`project-x/HL_HeadOfProductEngineeringAI/DECISIONS.md` in
  the personal-development repo).

Cover why-this-not-that, unit economics, vendor risk, the trust line, and
tying work to business outcomes (the gap that lost Gridsight). Output: a fix
list applied to deck/notes + a one-page call card in
`project-x/HL_HeadOfProductEngineeringAI/`.

Debrief booked: Tue 28 Jul 6:00am (Andrey Safonov, aspiresoftware.com). Dan away
29 Jul - 2 Aug.
