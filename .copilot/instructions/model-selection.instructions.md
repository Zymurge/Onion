---
description: "Use when choosing a model, delegating work, or deciding whether to upgrade or downgrade. Relative cost only; do not consult a price catalog."
applyTo: "**"
---

# Model cost awareness

Stay relatively cost-aware. Do not look up, maintain, or invent prices, model IDs, or rankings. Ignore model catalogs and historical model names in `.copilot/agents/agent.md`, other agent files, and archived docs.

Judge the model already in use by its relative tier: a cheaper or faster model, the current model, or a stronger reasoning model. Recommend a change in those terms. Name a specific model only if it is already selected in the session or the user asks for one.

## Match the model to the task

- Downgrade when the work is mechanical or already specified: small edits, tests, fixtures, boilerplate, renames, or a focused change with a clear contract and owning file.
- Stay put for ordinary implementation and debugging that follows an existing spec.
- Upgrade when the task is ambiguous or high-stakes: architecture boundaries, phase or state-machine behavior, protocol contracts, concurrency, or subtle synchronization. Also upgrade after two failed fix or compile passes on the same hard problem, instead of repeating the same approach.
- After the hard decision is settled and tests pin the behavior, recommend dropping back down for the remaining mechanical edits.

## How to recommend

- Make the recommendation before a large context read, or as soon as the task changes tier.
- Use one sentence: the direction, why this task needs it, and the check that would confirm the result.
- Do not compare dollar rates, context-window price brackets, or fast-mode premiums. If two available models can do the job, prefer the cheaper one.
- Do not upgrade by default. A stronger model is an exception, not the starting point.
