# UI iteration — status and handover (as of 22 Jul 2026, end of day)

Read this before resuming on another machine. The plan is
`2026-07-22-ui-iteration.md`; this file records what actually happened, what is
left, and the things that cost time to learn and are not obvious from the diff.

## Where the work is

- **All phases complete.** Branch `feat/ui-iteration`, **PR #2 open, not merged**:
  https://github.com/danfking/slipstream/pull/2
- Deliberately left unmerged — Dan's eyeball check against his original
  screenshot is the last verification step in the plan.
- `main` is still at the plan commit. Everything from this work (the harness,
  `docs/BRAND.md`, `docs/UI-BACKLOG.md`, `docs/evidence/`, all UI changes) is on
  the branch only until PR #2 merges. **Check out the branch, not main.**

State at handover: 65 tests green, `tsc --noEmit` clean, golden 10/10 on
`gpt-oss:20b`, final capture (run `v7`) clean across all four journeys.

## Resuming on a new machine

Verified end-to-end on the second PC; this is the real list, not a guess.

```bash
git clone https://github.com/danfking/slipstream && cd slipstream
git checkout feat/ui-iteration
npm install                      # includes playwright, marked, dompurify
npx playwright install chromium
ollama pull gpt-oss:20b          # ~13 GB, do this FIRST, it is the long pole
claude plugin install superpowers@claude-plugins-official
# then RESTART Claude Code — plugin skills only load at session start
```

Then confirm the baseline before changing anything, so later failures are
attributable:

```bash
npx vitest run                   # expect 65
npx tsc --noEmit
npm run golden                   # expect 10/10; needs a server on :3000
npm run ui:capture               # writes artifacts/ui/run<N>/
```

`data/seed.json` is committed, so `npm run seed` is not needed. There is no
`.env` and no `ANTHROPIC_API_KEY` on either machine — everything runs on local
Ollama via `SLIPSTREAM_PROVIDER=openai SLIPSTREAM_MODEL=gpt-oss:20b`.

## Things that cost time to learn

**Do not swap to a smaller local model.** Measured on the golden batch, same
machine: `gpt-oss:20b` 10/10 · `qwen2.5:7b` 8/10 · `llama3.1:8b` 8/10 ·
`qwen3:4b` 6/10 **and three times slower than the 20B model** — it is a
reasoning model burning tokens inside `<think>` blocks that `providers.ts`
then strips. Decisively, only gpt-oss:20b emits real markdown structure (bold,
tables); the 7-8B models emitted none, which makes them useless for any work on
rendering. Cold vs warm is the real speed lever: the full golden batch is ~147s
cold and ~28s warm. Warm the model before a demo or a capture run.

**The server detaches from the npx wrapper.** Killing the spawned PID leaves the
port bound, and the next boot then silently serves the *previous* config — this
burned a whole benchmark round that appeared to succeed while measuring the
wrong model. Kill by port, and assert `/api/health` reports the expected model
before trusting a run. Both are built into `scripts/ui/run-journeys.ts`.

**Journeys that re-ask in one conversation depend on model whim.** Asking
"draft invoices" twice in one session gets "I already drafted those" instead of
a second tool call, so there is no card to click. The approval journey reloads
between the reject and approve passes for this reason. Order matters too:
reject before approve, since approving invoices all the unbilled work and
leaves the later pass with nothing to draft. Invoice state is per-server-boot
(`store.ts` reads the seed at import, nothing writes back).

**The model's typography leaks into the UI.** It emits U+2011 non-breaking
hyphens and U+202F narrow no-break spaces, which render tight enough that a
reviewer read the date range `10-12` as two separate numbers off a screenshot.
It also writes `** Bold**` with a space inside the marker, which is invalid
CommonMark and renders as literal asterisks. `web/render.js` `normalizeMarkdown`
repairs all of this; it is the place to add more repairs, and it is unit-tested.

**`breaks: true` stops a list interrupting a paragraph.** That is why the
briefing's bullets rendered as literal `*` characters. Fixed by inserting the
blank line in `normalizeMarkdown`, not by turning `breaks` off (single newlines
are meaningful in these line-per-fact answers).

**`tsconfig.json` only included `src/`**, so `npm run typecheck` silently
skipped `scripts/` for the whole life of the repo. Now includes both.

## The critique loop, if you want to run it again

1. `UI_RUN=<label> npm run ui:capture` — four journeys, ~60-90s warm.
2. Spawn one general-purpose agent per journey. Each must: invoke the
   `artifact-design` skill, read **every** PNG with the Read tool (vision),
   read `journey.json` and `console.json`, read `docs/BRAND.md`, and return a
   JSON array of `{id, severity, axis, journey, screenshot, description,
   suggested_fix}`. Tell them to favour recall and report uncertain items;
   synthesis filters.
3. Fix, recapture, then a second round of agents told to report **only**
   demo-blocking/high and to verify a numbered list of the specific fixes.

Two rounds ran. 56 findings in round one, of which nine were already fixed and
two were misreads (the navy "Morning briefing" pill is the user's own message
bubble; the 500 in the edges console is the deliberate provider-down step).
Round two returned two genuine findings and confirmed the rest.

Note the failure mode: agents read pixels, so they report *symptoms* confidently
and *causes* wrongly. Both round-two findings had the wrong diagnosis attached.
Check the raw model output before acting on a "data is garbled" claim.

Useful env vars: `UI_RUN=<label>` fixes the run folder (for before/after pairs),
`UI_JOURNEYS=core-qa,edges` runs a subset.

## Left open

- **The pending indicator's elapsed-seconds counter is unverified in any
  screenshot.** It appears after 3s and every captured turn now settles faster
  than that on a warm model. It matters on a *cold* model — the actual demo-day
  risk. Worth one manual check with Ollama cold.
- **No journey produces a wide table any more**, so the table cell-wrapping fix
  is not stress-tested in the current captures.
- **Receipt dedup within one session is untested** — the approval journey
  reloads, so two calls to the same tool in one session are never captured.
- The rest of the deferred findings are in `docs/UI-BACKLOG.md` on the branch,
  with reasons.

## Local memories (these do NOT sync between machines)

Claude's memory files live under
`~/.claude/projects/C--Users-Home-projects/memory/` and are per-machine. If you
want them on the new PC, recreate three:

- `pr-with-evidence` (feedback) — PRs embed before/after screenshots and
  test/golden logs, not just a description. The demo's credibility rests on
  shown proof, the same argument the product itself makes.
- `slipstream-demo-context` (project) — what Slipstream is, the debrief around
  Tue 28 Jul 2026, the golden batch as the behaviour gate, provider config.
- `slipstream-local-model-choice` (project) — the model benchmark above; the
  "smaller is faster" intuition inverts here and re-testing costs ~15 minutes
  plus a 13 GB pull.

## Loose end

One critique agent reported receiving an unsigned message mid-task, formatted
like a user turn, telling it to act as a "design lead" and produce an unrelated
editorial artifact. It ignored it as injected noise. Nothing in this session
sent it and no other agent reported the same. Recorded in case it recurs.
