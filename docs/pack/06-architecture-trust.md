# Architecture and trust

### How the assistant gets its answers

There are four ways to connect a model to the record. Three lost:

- **Fine-tuning** lost because the questions are about today's data. A model trained on last month knows nothing about this week.
- **RAG** lost for a similar reason: it is built for documents, and this data is rows and numbers. Ask it to add up unbilled labour across retrieved text and you get a confident wrong number.
- **Letting the model write SQL** lost even though it demos well. The model writes a subtly wrong query against a forty-year-old schema, the answer looks fine, and nobody catches it. Generated queries running on the shared production database can also slow it down or break it for everyone else.
- **A tool layer won:** a set of typed, tested functions like "get unbilled work" and "get schedule load". The model only chooses which function to call. Every number is computed by code someone wrote and tested.

### Trust, in four layers (all working in the prototype)

1. Numbers come from tested functions. Same input, same output, every time.
2. **Receipts.** Every answer shows the calls and raw results behind it, grouped under the question that caused them. Anyone can check any number.
3. **Read-only first.** The model's toolbox contains no write tools at all. The one action it can propose, drafting invoices, does nothing until a person clicks approve, and the approval gets its own receipt. Write tools come later, one at a time, each behind the same kind of approval.
4. **The golden batch.** A set of real questions with known answers runs against the live system on every release. If accuracy slips, the release fails. The same harness checks the formatting of replies, so problems get caught by tests instead of by people.

### Observable from the outside

The prototype also traces itself: every conversation emits an OpenTelemetry trace of its model turns and tool calls, with token usage on each. Receipts show the GM where a number came from; the traces show the operator what ran and what it cost. Console by default, or shipped to any OpenTelemetry backend.

### Model and provider are settings, not structure

A mid-tier model is the right default here, because this workload needs speed more than deep reasoning, and simple requests can go to an even cheaper model. Changing model or provider is a configuration change, which I can show live: this demo has run on a commercial API and on a fully local open model with no code change. That is also the answer to vendor risk, and it keeps the cost per marina at cents per session.
