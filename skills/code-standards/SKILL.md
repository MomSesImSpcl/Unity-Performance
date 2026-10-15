---
name: code-standards
description: Unity C# coding standards, write-time performance rules and code review. Use whenever writing, editing or refactoring Unity C# scripts (MonoBehaviours, gameplay systems, UI, managers), even if the user doesn't mention performance or standards, so code is written fast and allocation-free from the start. Also use when the user mentions coding standards or conventions, writing code to spec, defining standards for a project, cohesion and coupling, design pattern selection, or naming conventions, or wants a code review on the design and standards dimension. A review aimed at speed, frame rate or memory belongs to unity-performance.
---

# code-standards

Use progressive disclosure: read the required workflow references at the stage where they apply, and only the technical references relevant to the task. Do not bulk-load this directory or sibling skills. References contain binding original rules, not optional background. Loading less must not omit an applicable requirement.

## Choose the task

- **Focused convention or design explanation:** read the matching technical reference below. State that these are plugin defaults; project conventions take precedence.
- **Writing or editing Unity C# code:** follow workflow step 1.
- **Defining standards or writing other languages:** follow workflow steps 2–3.
- **Reviewing project code:** follow the complete workflow, including independent final review.

Conceptual answers do not constitute project findings or acceptance. Do not initiate a project review for a conceptual question. Once making project-specific findings, proposing code changes or claiming a path is clean, apply the full relevant evidence, validation and reporting rules below.

## Workflow

1. **Writing or editing Unity C# code:** read [Unity C# write-time rules](references/unity-write-rules.md). It covers the core rules and the C#/Unity hard rules for writing, so don't also load core-rules or language-hard-rules. Load another reference below only when the code needs that depth (collection choice, pattern choice, naming detail). Write the code to those rules from the start rather than fixing it afterwards.
2. **Defining standards, reviewing code, or writing in another language:** read [applicability, hard rules and writing requirements](references/core-rules.md) and the relevant language section of [language-hard-rules.md](references/language-hard-rules.md). Repository conventions govern; preserve the distinction between HARD RULE and DEFAULT.
3. For defining standards, survey the repository and produce keep / add / correct with toolchain configuration as required by the core rules.
4. For a code review, read the complete [review protocol](references/review-protocol.md) before dispatching work. Execute its reconnaissance, four perspectives, merge, independent final review, severity and evidence requirements. Writing-only tasks do not load this protocol.
5. Primary scope is C#/Unity. Consult other-language rules only for an explicit review in that language, adapting the Unity asset-evidence perspective as the preserved protocol requires.

## Technical reference routing

Read a row when the task involves its topic. For broad reviews, select all implicated topics after reconnaissance; for a narrow question, select only that topic.

| Reference | Topic / when to read |
|---|---|
| [unity-write-rules.md](references/unity-write-rules.md) | Write-time C#/Unity performance and correctness rules (workflow step 1). Can also be copied into a Unity project's `.claude/rules/` so it loads for every `.cs` file |
| [algorithm-efficiency.md](references/algorithm-efficiency.md) | Algorithmic efficiency and space discipline |
| [cohesion-coupling.md](references/cohesion-coupling.md) | High cohesion, low coupling: actionable criteria and refactoring moves |
| [design-patterns.md](references/design-patterns.md) | Design patterns: selection criteria and anti-patterns |
| [language-hard-rules.md](references/language-hard-rules.md) | Language-specific hard rules (C#/Unity · Go · C++ · Java · Lua) |
| [naming-conventions.md](references/naming-conventions.md) | Naming and style: casing quick reference for C#, Go, C++ and Java, plus Lua |

For cross-skill handoff details, consult [sibling routing](references/sibling-routing.md) when the task crosses into performance or allocation engineering.

Related skills: unity-performance covers bottlenecks and engine optimization; csharp-zero-gc covers system allocation commitments and regression guards; code-standards covers conventions, design and orchestrated reviews. Load a sibling only when that distinct workflow is needed.
