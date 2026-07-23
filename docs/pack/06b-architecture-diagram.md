# The same architecture, as a picture

![One layer, several consumers: the system of record feeds a typed tool layer; the assistant, the golden batch, and later partners and agent teams all consume that same layer; the model provider is a setting underneath.](/pack/architecture.svg)

Build the tool layer once. The assistant uses it today, the accuracy checks use it on every release, and the later stages (partner access, the Advisor, agent teams) use the same layer instead of new plumbing.
