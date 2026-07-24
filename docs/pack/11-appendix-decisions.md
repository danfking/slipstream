# Appendix: the decision record

The full trail, one line per decision. Any of these can be opened up.

| # | Decision | Chosen | Rejected, and why |
|---|---|---|---|
| 1 | Evaluation criteria | Five tests: data moat, named buyer, revenue mechanics, buildable small, portfolio leverage in both directions | "Uses AI" as a test (leads to AI for its own sake) |
| 2 | Opportunity | Assistant across the system of record, service department first | Slip pricing (Dockwa's ground); voice/sales automation (partner already covers it); standalone copilot (a feature, not a venture); open API as the product (no buyer, gives away the advantage) |
| 3 | Architecture commitment | Ship as an assistant, built so agents can be added without a rebuild | Leading the pitch with agent teams (sells architecture to a buyer who wants answers) |
| 4 | Buyer and user | GM pays based on P&L value; the service manager uses it daily | Treating them as one person (confuses both the demo and the pricing) |
| 5 | Build or partner | Build: the product is DockMaster's own knowledge, and the tool layer is the missing API | Partnering the assistant (the company's core knowledge built on a partner's balance sheet) |
| 6 | Data access | Typed tool layer: the model picks the question, code computes the answer | Fine-tuning (goes stale); RAG (wrong for figures); model-written SQL (plausible wrong answers, and risk to the shared database) |
| 7 | Deployment | Cloud-first, hybrid only where connectivity requires it; the add-on gives desktop customers a reason to move to the cloud product | On-premises first (no fast delivery loop) |
| 8 | Trust model | Tested functions, receipts, read-only first, human-approved writes, golden batch on every release | Trusting the model with arithmetic or with write access |
| 9 | Model | Mid-tier by default, cheaper tier for simple requests, provider and model as settings checked against the golden batch | Top-tier everywhere (slower and dearer for no gain); tying to one vendor (settings swap plus a named fallback plan instead) |
| 10 | Prototype scope | Live cross-department questions, proactive briefing, approval gate, golden batch shown live, synthetic data declared up front; since extended with streaming replies, a measured suggestion gate, a status page, a browsable record, and OpenTelemetry traces | Polish first (credibility comes from receipts and checks, not looks) |
| 11 | Go-to-market | Expansion into the existing base, tiered pricing along the stages, group reuse as the scale story | Cold-market entry; flat pricing; treating this as marine-only |
