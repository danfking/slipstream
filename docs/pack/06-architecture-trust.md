# Architecture and the trust model

### How the assistant gets answers: a typed tool layer

Four ways to connect a model to the record. Three were killed:

- **Fine-tuning**, killed: the questions are about today's data; a model trained on last month knows nothing about this week. Wrong tool for facts that change daily.
- **RAG**, killed for the same reason in milder form: built for documents, and this data is rows and numbers. "Sum my unbilled labour" over retrieved text chunks gives a confident wrong number.
- **NL-to-SQL**, the trap that demos well: the model writes a subtly wrong join against a forty-year-old schema, the answer looks plausible, and generated SQL running on the shared production database is an operational risk to every other user of it.
- **Tool layer**, the winner: typed, tested functions ("get unbilled work", "get schedule load"). The model decides *which* question to ask, never *how* to compute the answer. Every number comes from code.

### Trust, in four layers (all shipped in the prototype)

1. Numbers come from deterministic tool calls: same input, same output, repeatably.
2. **Receipts.** Every answer shows the tool calls and raw results behind it, grouped by the question they served. Trust comes from checkability.
3. **Read-only first.** The model's toolbox physically contains no write tools. The one draft action requires a human to click approve, and the approval itself gets a receipt. When confidence grows, write tools arrive one at a time, always human-gated.
4. **The golden batch.** Real questions with asserted answers, run end-to-end through the live stack on every release. Accuracy is a number in CI, not a feeling. The same harness gates markdown quality and keeps the model's stochastic failures out of the demo.

### Model and provider are configuration, not architecture

Sonnet-tier is the recommended default (routing workloads need speed, not frontier reasoning); requests that don't need reasoning can route to a cheaper tier; provider swap is an environment variable, demonstrated live. This demo has run on a frontier API and a fully local open-weights model with zero code change. Vendor risk and per-marina serving cost (cents per session, caching-aware) are managed quantities, not hopes.
