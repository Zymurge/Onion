---
description: "Use when choosing a model, delegating work, or deciding whether to recommend a model change."
applyTo: "**"
---

# Model selection

## Defaults

- Use GPT 6 Luna for conversational requests, environment or workspace questions, and trivial coding tasks such as a small rename, formatting change, or obvious one-line edit.
- Use GPT 5.6 Luna for most light but non-trivial coding tasks, including focused bug fixes or small features with a clear contract and owning module.
- For work beyond that tier, recommend stepping up to a stronger reasoning model. This includes ambiguous requirements, architecture decisions, protocol or state-machine changes, concurrency, subtle synchronization, or two unsuccessful focused fix or compile attempts.
- Treat these as defaults, not mandates. Follow an explicit user model selection, and do not silently change the selected model.
- Once difficult reasoning is complete and tests pin the behavior, recommend returning to the task-appropriate default for remaining mechanical work.

## Scope gate

- Do not begin implementation when the task is materially ambiguous or obviously large in scope. Ask focused questions to resolve ambiguity before coding.
- If the plan is missing or not granular enough to implement safely, say what is unclear or too broad and recommend pausing implementation to create a task-driven plan.
- Decompose broad work into bounded, independently implementable tasks with clear outcomes, ownership, acceptance criteria, and validation. Aim for tasks that a task-appropriate lower-tier model can complete reliably.
- Suggest refactoring or architectural changes when they would clarify ownership, reduce risk, or make the work more incremental. Present them as recommendations and do not expand the agreed scope without approval.

## Recommendations

- Do not upgrade by default. If multiple models can handle the task reliably, prefer the cheaper one.
- Recommend an upgrade when the task exceeds the selected model's tier, and recommend a downgrade when the task is simpler than that tier. Do not change the selected model silently.
- When recommending a change, state the direction, why the task needs it, and the check that would confirm the result in one concise sentence. Recommend the change as soon as the need is clear, preferably before substantial work.
- Do not look up or compare prices, context-window brackets, or fast-mode premiums. Do not use model catalogs, historical model names, or model recommendations in agent files and archived docs as evidence.
- Use relative terms such as "stronger reasoning model" for step-ups unless the user asks for a specific model or one is already selected in the session.
