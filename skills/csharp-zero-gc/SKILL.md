---
name: csharp-zero-gc
description: C# zero-GC engineering plans. Use when the user asks to make a system allocation-free, or mentions zero-GC, zero allocation, GC spikes, per-frame allocation budgets, object pooling systems, or preventing GC regressions. Produces a plan with commitment levels, acceptance criteria and regression guards, not a one-off code fix. For general stutter or FPS problems, or a single allocation found while optimizing, use unity-performance instead.
---

# csharp-zero-gc

Use progressive disclosure: read the required workflow references at the stage where they apply, and only the technical references relevant to the task. Do not bulk-load this directory or sibling skills. References contain binding original rules, not optional background. Loading less must not omit an applicable requirement.

## Choose the task

- **Focused explanation of an allocation pattern, library or guardrail:** read only the corresponding technical reference below. For commitment tiers and acceptance criteria, read [commitment tiers](references/core-rules.md).
- **Allocation inventory, remediation or engineering plan:** follow the full workflow below. Narrow code fixes still require applicable evidence and guardrails.
- **Rough lead list:** follow inventory and validation requirements; [independent review](references/independent-review.md) defines the limited exception for this output.

Conceptual answers do not constitute project findings or acceptance. Do not initiate a project review for a conceptual question. Once making project-specific findings, proposing code changes or claiming a path is clean, apply the full relevant evidence, validation and reporting rules below.

## Workflow

1. Read [commitment tiers and rollout](references/core-rules.md) before choosing a scope. Declare L1, L2 or L3 and its acceptance boundary.
2. For an allocation inventory or remediation, read [allocation inventory](references/allocation-inventory.md) and [execution strategy](references/execution.md). Follow the committed call chain and classify every allocation site.
3. Read only the technical references needed for the current patterns, library choices or regression guards.
4. Before reporting findings, read the [pseudo-optimization checks](../unity-performance/references/finding-validation.md) (shared with unity-performance) and [output requirements](references/reporting.md).
5. Before delivering an engineering plan, read and execute [independent adversarial review](references/independent-review.md). Preserve its required independent reviewer and the explicit rough-lead-list exception. Guardrails and acceptance measurements remain part of delivery.

## Technical reference routing

Read a row when the task involves its topic. For broad reviews, select all implicated topics after reconnaissance; for a narrow question, select only that topic.

| Reference | Topic / when to read |
|---|---|
| [guardrails.md](references/guardrails.md) | Zero-GC guardrails: keeping the gains from being eaten by everyday commits |
| [zero-alloc-libraries.md](references/zero-alloc-libraries.md) | Choosing frontier zero-allocation libraries (2025–2026 ecosystem) |
| [zero-alloc-patterns.md](references/zero-alloc-patterns.md) | Zero-allocation architecture pattern library (structural replacement, cures rebound) |

Related skills: unity-performance covers bottlenecks and engine optimization; csharp-zero-gc covers system allocation commitments and regression guards; code-standards covers conventions, design and orchestrated reviews. Load a sibling only when that distinct workflow is needed.
