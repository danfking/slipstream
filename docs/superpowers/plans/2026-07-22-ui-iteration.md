# Slipstream UI Iteration: Agent Team with Visual Analysis

## Context

The merged demo works (23 tests, golden 10/10) but the UI is one-shot quality. Dan's screenshot review found: assistant replies show **raw markdown** (unrendered `**bold**`, `*` lists); the receipts panel shows only the latest turn's tool names with **no attribution** (which message they served, no per-turn history, no indication the briefing's overnight items came from the Blu channel); the model cites tool names inline as prose asterisks. Goal: iterate the UI to demo quality using agents that exercise the real app in a browser, critique screenshots with Claude vision, and drive a capped fix loop. Deadline pressure: debrief possibly by Tue 28 Jul.

## Research: existing tools and skills to leverage (verified)

| Capability | What exists | How we use it |
|---|---|---|
| Browser automation | Playwright 1.61 via npx; **Chromium headless builds already cached** in `ms-playwright` | Scripted journeys: click, type, wait, screenshot, capture console/network errors |
| Visual analysis | The Read tool renders PNGs for any agent (Claude vision) | Critique agents read screenshots directly; no extra tooling |
| App driving | Built-in `run` skill (launch/drive/screenshot project apps) | Fallback/reference; Playwright scripts are more repeatable for journeys |
| Design rubric | `artifact-design` skill (visual hierarchy, spacing, typography fundamentals) | Critique agents load it so feedback is calibrated, not vibes |
| Fix discipline | superpowers (TDD, subagent-driven-development, code review) | Fix batches follow the same loop as the main build |
| Behaviour safety net | vitest (23 tests) + golden batch (`npm run golden`, 10/10 on local gpt-oss:20b) | Regression gate after UI changes; free to run (local model) |
| Landing | Dan's PR-with-evidence rule (memory) | Final PR embeds before/after screenshots as evidence |
| Not available | No browser/devtools MCP server connected | Playwright via node scripts instead |

Markdown rendering: vendor `marked` + `DOMPurify` minified builds into `web/vendor/` (no build step, no CDN at demo time, sanitized against injection via tool-result content).

## Architecture of the loop

**Capture is sequential, critique is parallel.** One harness process owns the server + Ollama and replays all journeys, saving artefacts; then a fleet of critique agents reads the artefacts concurrently (pure file reads, no contention). Fix, recapture, re-critique. Max 2 fix rounds.

```
Phase 0 harness → Phase 1 known fixes → capture v1 → 4 critique agents (parallel)
      → synthesize backlog → fix batch → capture v2 → re-critique (parallel)
      → regression (vitest + golden) → PR with before/after evidence → review → merge
```

## Phase -1: Persist this plan for cross-machine resume (first action on approval)

- Copy this plan verbatim to `docs/superpowers/plans/2026-07-22-ui-iteration.md` in the slipstream repo, commit directly to `main` (docs-only commit), push to `danfking/slipstream`.
- Execution then proceeds on branch `feat/ui-iteration` (created in Phase 0); every phase ends in a commit and a push, so any machine can resume mid-stream from the branch.

### Resume-from-another-machine notes (make the plan self-contained)

- **State at plan time:** `main` = PR #1 merged (full demo: tool layer, assistant, UI v1, golden batch). 23 unit tests; `npm run golden` = 10/10 on local `gpt-oss:20b`.
- **Prerequisites on the other machine:** Node 22+, `gh` authenticated as danfking, Ollama with `gpt-oss:20b` pulled (or set the provider env vars to any OpenAI-compatible endpoint / `ANTHROPIC_API_KEY` for the Anthropic path), then `git clone danfking/slipstream && npm install && npm run seed && npx playwright install chromium`.
- **To resume:** checkout `feat/ui-iteration` if it exists (continue from the last committed phase — phases are labelled in commit messages `ui-iteration: phase N …`), else start at Phase 0. The journey artefacts in `artifacts/` are regenerable (`npm run ui:capture`); only `docs/BRAND.md` and code changes are canonical.

### Machine 2 setup, actual (22 Jul 2026)

Executed on the second PC after a fresh clone. Deltas from the prerequisites above, for whoever clones next:

- `gpt-oss:20b` was **not** pulled locally (only qwen2.5:7b, qwen3:4b, nomic-embed-text) — a ~13 GB `ollama pull` is part of setup, not an assumption. Start it first and let it run in the background.
- No `ANTHROPIC_API_KEY` and no `.env` (gitignored, so it does not clone). This machine runs the Ollama path for both journey capture and the golden gate.
- Playwright chromium builds were already cached, but `playwright` was not a dependency — it is now a devDependency, so `npm install` covers it; `npx playwright install chromium` tops up the browser.
- superpowers was not installed; `claude plugin install superpowers@claude-plugins-official` (v6.1.1), then restart Claude Code so its skills load.
- Fresh-clone baseline confirmed before any UI change: `npx vitest run` 23/23, `npx tsc --noEmit` clean.

## Phase 0: Journey harness (inline, ~1 task)

- `npm i -D playwright` + ensure chromium (`npx playwright install chromium` tops up the cached builds).
- Create `scripts/ui/journeys.ts`: journey definitions as data — ordered steps `{action: 'goto'|'click'|'type'|'submit'|'waitForReply'|'expand-receipt'|'screenshot'|'resize', …}`.
- Create `scripts/ui/run-journeys.ts`: boots the server (`SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b`), runs each journey in sequence, writes to `artifacts/ui/<runN>/<journey>/`: numbered step screenshots, `console.json` (browser console errors/warnings), `journey.json` (step timings, failures). `npm run ui:capture`.
- Journeys (also the demo script's spine, from `docs/DEMO.md`):
  1. **first-run-briefing** — load page, run briefing, expand each receipt; includes a 1280×720 "projector" resize step.
  2. **core-qa** — unbilled question, haul-out question, overnight question (markdown-heavy replies).
  3. **approval-gate** — draft invoices, inspect card, approve, re-ask unbilled (number must drop); second pass with reject.
  4. **edges** — empty submit, rapid double-send, very long question, provider-down error state (server pointed at a dead port), receipts panel with a huge JSON result expanded.
- `artifacts/` goes in `.gitignore`.

## Phase 1: Known-defect fixes first (don't spend agents rediscovering the reported bugs)

1. **Markdown rendering** (`web/vendor/marked.min.js`, `web/vendor/purify.min.js`, `web/app.js`): assistant messages render sanitized markdown (bold, lists, tables, headings); user messages stay plain text. CSS for rendered elements in `style.css` (tables scroll inside the bubble).
2. **Receipts attribution + history** (`web/app.js`, `src/server.ts` if needed): receipts grouped per conversation turn with the question as the group header, prior turns collapsed but kept; each receipt row keeps name + input summary; results containing `source` fields get channel badges (e.g. a "Blu Voice Agent" chip) so provenance is visible at panel level — this is Dan's "briefing came from Blu" gap.
3. **Inline tool citations**: post-process reply text so `*get_unbilled_work*`-style citations render as small chips that scroll/flash the matching receipt (or at minimum styled code chips, not stray asterisks). Also extend `src/assistant/system.ts` so citation format is explicit and consistent.
4. **Loading affordance**: replace the italic pending text with a typing indicator + disable state that survives slow local-model first-loads (30-60s) without looking broken.

Each with the narrowest sensible check (markdown/citation post-processing as pure functions with vitest tests in `web/` is overkill; put the pure transforms in `web/render.js` and test the transforms via a small vitest jsdom-free unit if practical, else rely on journey screenshots).

## Phase 1.5: DockMaster brand research (1 agent, parallel with Phases 0-1)

One research agent with web access derives a brand reference from DockMaster's public surfaces:
- Sources: dockmaster.com (marketing site), portal.dockmaster.com blog posts (they contain **DockMaster Web product screenshots** — the actual target aesthetic), the Blu Voice Agent product page.
- Method: fetch pages for structure/copy tone; download logo + product screenshots to `artifacts/brand/` via curl and **read them with vision**; extract palette (hex estimates confirmed by sampling with a tiny node script if needed), typography (families/weights/scale), component patterns (nav, cards, tables, buttons, badge shapes, spacing density), and UI tone (density, corner radii, shadows).
- Output: `docs/BRAND.md` — a token sheet (colors, type, radii, spacing) + 3-5 annotated reference screenshots + "do/don't" notes.
- **Identity guardrail:** Slipstream adopts DockMaster Web's *styling family* (palette, type feel, component idiom) so it reads as native to their ecosystem; it keeps its own name and does not reproduce the DockMaster logo. Demo line: "styled to sit inside DockMaster Web." This mirrors the A6 honesty pattern: harmony, not impersonation.
- Application: brand tokens become CSS variables in `web/style.css` (`:root`), applied in the Phase 3 fix batch; header/badges/cards restyled to the token sheet.

## Phase 2: Critique fleet (parallel agents, read-only)

Spawn 4 general-purpose agents in one message, one per journey. Each agent:
- Loads the `artifact-design` skill for the visual rubric.
- Reads every screenshot in its journey folder (vision) plus `console.json`/`journey.json`.
- Critiques on five axes: **correctness** (does the UI state match the receipts data; console errors), **UX** (affordances, loading, error states, discoverability of receipts/approval), **visual** (hierarchy, spacing, contrast, alignment, projector readability at 1280×720), **brand consistency** (against `docs/BRAND.md` + reference screenshots from Phase 1.5 — does it read as native to DockMaster Web), **demo fitness** (would this moment look credible in front of a CTO).
- Returns structured findings: `{id, severity: demo-blocking|high|polish|defer, axis, journey, screenshot, description, suggested_fix}`. Explicitly instructed: report everything including uncertain/low-severity; a synthesis step filters (recall over precision).

## Phase 3: Synthesize and fix (capped loop)

- Merge findings, dedupe, rank. Fix order: demo-blocking → high → polish if cheap. `defer` goes to a `docs/UI-BACKLOG.md`.
- Implement fix batch inline (small codebase, tight coupling), re-run `npm run ui:capture` (v2), re-spawn critique agents on changed journeys only.
- **Hard cap: 2 fix rounds.** Exit early when no demo-blocking or high findings remain. Anything left is backlog, not perfection-chasing — the demo date is the boss.

## Phase 4: Regression and landing

- `npx vitest run` (23+) and `npm run golden` (10/10) must both pass — UI changes must not touch behaviour.
- Per Dan's PR-with-evidence rule: PR from `feat/ui-iteration` with **before/after screenshot pairs** for each fixed finding plus test/golden logs, fresh-eyes review of the diff, fix findings, merge. (Commit-and-push at every phase boundary per Phase -1, so the branch is always resumable from another machine.)
- Update `docs/DEMO.md` if any demo moment changed visually.

## Files touched (primary)

- New: `scripts/ui/journeys.ts`, `scripts/ui/run-journeys.ts`, `web/vendor/*`, `web/render.js`, `docs/UI-BACKLOG.md`
- Modified: `web/app.js`, `web/style.css`, `web/index.html`, `src/assistant/system.ts`, `package.json`, `.gitignore`
- Untouched: tool layer, chat loop, golden assertions (guarded by regression gate)

## Verification

1. `npm run ui:capture` completes all 4 journeys with zero console errors and produces screenshots.
2. Critique round 2 reports zero demo-blocking/high findings.
3. `npx vitest run` and `npm run golden` green.
4. Dan eyeballs the running UI (`npm run dev` + localhost:3000) against his original screenshot — markdown rendered, receipts attributed per turn with Blu badge visible after a briefing.
