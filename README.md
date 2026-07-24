# Slipstream

An operations assistant for marina and boatyard businesses: it makes the marina's operational questions answerable in natural language. Built as a working prototype over a synthetic marina system of record, modelled on the module structure of a marine ERP (marina management, service and work orders, parts, financials).

## Quickstart

```bash
npm install
npm run seed        # regenerate the deterministic demo dataset
npm run test        # 22 unit tests, no network or key required
npm run dev         # http://localhost:3000
```

The assistant needs a model provider:

| Env var | Default | Notes |
|---|---|---|
| `SLIPSTREAM_PROVIDER` | `anthropic` | `anthropic` or `openai` (any OpenAI-compatible endpoint) |
| `SLIPSTREAM_MODEL` | `claude-sonnet-5` / `qwen3:4b` | per provider |
| `SLIPSTREAM_BASE_URL` | `http://localhost:11434/v1` | openai provider only (Ollama default) |
| `SLIPSTREAM_PROVIDER_KEY` | — | openai provider only, if the endpoint needs one |
| `ANTHROPIC_API_KEY` | — | anthropic provider |

Provider and model choice is deliberately configuration, not architecture. Example, fully local and offline: `SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b npm run dev`.

### Telemetry

Each conversation is one OpenTelemetry trace: a `chat` root span, an `llm.turn` span per model call (with token usage), and a `tool.<name>` span per tool executed.

| Env var | Default | Notes |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Ship spans to an OTLP collector. When unset, spans print to the console. |
| `SLIPSTREAM_OTEL` | `on` | Set to `off` to disable tracing entirely. |

## Architecture

```
                       synthetic system of record (data/seed.json, deterministic)
                                          │
                              typed tool layer (src/tools)
                    9 tested functions; every number computed in code
                     │                    │                     │
              assistant loop        golden batch          (future: MCP server,
              (src/assistant)      (npm run golden)        partner integrations)
                     │
              web UI with receipts + approval gate (web/)
```

## Trust model

1. Numbers come from deterministic tool functions, never from the model — the model chooses *which* question to ask, not *how* to compute the answer.
2. Every answer ships with receipts: the raw tool calls and results, visible in the UI.
3. The model's toolbox is read-only, plus one draft action; the apply function is not registered with the model and runs only behind a human approval gate.
4. A golden batch (`npm run golden`) runs ten real questions with asserted answers end-to-end through the same HTTP stack the UI uses; it gates releases.
5. The dataset is synthetic and deterministic (fixed seed, fixed anchor date), so every demo run is reproducible.

## Hosting (Fly.io, burnish pattern)

The app deploys to Fly.io as `slipstream-dk` via `.github/workflows/deploy.yml` on every push to `main` (remote Docker build, no local Docker needed). One-time setup, run by Dan (keys never leave your terminal):

```bash
fly apps create slipstream-dk
fly secrets set -a slipstream-dk SLIPSTREAM_PASSCODE="<choose one>" SLIPSTREAM_PROVIDER_KEY="<OpenAI API key>"
fly tokens create deploy -a slipstream-dk   # → add as FLY_API_TOKEN repo secret on GitHub
```

Check `SLIPSTREAM_MODEL` in `deploy/fly.toml` against the models your OpenAI account actually lists (`gpt-4o-mini` assumed) before the first deploy.

Hosted behaviour: `/deck.html` and `/pack/*` are public (the pitch burns no credits); `/api/chat`, `/api/briefing`, and `/api/approve` require either the passcode session (server-held key, Dan's OpenAI credit) or bring-your-own-key headers (key stays in the visitor's browser, used per request, never stored or logged). A per-IP token bucket caps usage. Locally, with no `SLIPSTREAM_PASSCODE` set, everything stays open exactly as before.

## The deck

`/deck.html` presents the written case pack (from `docs/pack/`) as slides through the same markdown pipeline as chat replies: arrow keys or edge-clicks to navigate, `#/n` deep links, and print-to-PDF produces the standalone pack document.

## Deliberately out of scope for the prototype

Authentication and multi-tenancy; real ERP synchronisation (the tool layer would sit on the production database the same way it sits on the in-memory store); production write paths beyond the invoice-draft flow; usage metering and billing.
