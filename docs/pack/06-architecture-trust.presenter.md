# Architecture and trust

### How it answers

- Four ways to connect a model; three lose (fine-tuning goes stale, RAG is wrong for figures, model-written SQL is subtly wrong)
- Tool layer wins: typed, tested functions, the model only picks which to call

### Trust, four layers, all live in the prototype

- Numbers from tested functions, same answer every time
- Receipts behind every number
- Read-only first, writes wait for human approval
- Golden batch gates every release

### Observable from the outside

- Every conversation is an OpenTelemetry trace: model turns, tool calls, token usage
- Receipts for the GM, traces for the operator

### Model is a setting, not structure

- Shown running local and commercial, no code change, cents per session
