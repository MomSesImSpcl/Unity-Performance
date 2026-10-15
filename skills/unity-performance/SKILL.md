---
name: unity-performance
description: "Unity performance optimization. Use when the user asks to optimize a class, view, function, folder or an entire module, or mentions stutter, lag, frame drops, low FPS, jank, overheating, battery drain, GC allocation, memory leaks, DrawCalls, batching, overdraw, slow loading, large build size, Profiler, PerfDog, or crash rates. Also covers pure C# micro-optimization: algorithmic complexity, memory layout, SIMD, and compiler-level tuning. Fixing individual allocations found while optimizing belongs here; a committed plan to make a whole system allocation-free with regression guards belongs to csharp-zero-gc."
---

# unity-performance

Use progressive disclosure: read the required workflow references at the stage where they apply, and only the technical references relevant to the task. Do not bulk-load this directory or sibling skills. References contain binding original rules, not optional background. Loading less must not omit an applicable requirement.

## Choose the task

- **Focused explanation or technique question:** read only the matching technical reference below. Load [runtime premises](references/runtime-ladder.md) when the answer depends on runtime/compiler compatibility.
- **Symptom diagnosis:** read [core rules](references/core-rules.md) and [diagnosis](references/diagnosis.md), then the implicated profiling/subsystem reference. Read runtime premises before runtime-dependent recommendations.
- **Project-code review or optimization:** follow the full workflow below; scale the report to the target as the execution rules require.
- **Device acceptance or live incidents:** read [core rules](references/core-rules.md), [diagnosis](references/diagnosis.md), [device acceptance](references/device-acceptance.md), and the implicated field-operations reference. Follow the full workflow if this expands into code optimization.

Conceptual answers do not constitute project findings or acceptance. Do not initiate a project review for a conceptual question. Once making project-specific findings, proposing code changes or claiming a path is clean, apply the full relevant evidence, validation and reporting rules below.

## Workflow

1. For a project-code review or optimization, read [core rules](references/core-rules.md) and [execution strategy](references/execution.md). Confirm the target assembly, platform and scope.
2. Then read the [review method](references/review-method.md): exploration operators, coverage dimensions and the coverage inventory. Explore first; use the applicable technical references below to catch omissions afterward. Read [runtime premises and optimization ladder](references/runtime-ladder.md) before recommending anything whose support depends on the runtime or compiler (Span, unsafe, SIMD, inlining, new value-type generics, hot-update assemblies), or when choosing which optimization layer to work on.
3. For symptom diagnosis, read [diagnosis](references/diagnosis.md); load profiling or the implicated subsystem reference as evidence narrows the problem.
4. Before delivering findings or making changes, read [finding validation](references/finding-validation.md) and [reporting](references/reporting.md). Preserve the complete-review-before-editing rule, evidence requirements and change tiers.
5. For device acceptance or live incidents, also read [device acceptance](references/device-acceptance.md).

## Technical reference routing

Read a row when the task involves its topic. For broad reviews, select all implicated topics after reconnaissance; for a narrow question, select only that topic.

| Reference | Topic / when to read |
|---|---|
| [baseline-antipatterns.md](references/baseline-antipatterns.md) | Final omission sweep after exploration, not the main review loop. Group A: algorithms and redundancy; group B: API and lifecycle anti-patterns. Numbered for citation |
| [benchmarking.md](references/benchmarking.md) | Benchmarking methodology: no numbers, no optimization |
| [csharp-hotpath.md](references/csharp-hotpath.md) | Hot-path allocation sources and their standard fixes |
| [Allocation inventory](../csharp-zero-gc/references/allocation-inventory.md) | Enumeration/boxing edge cases including Transform children, implicit delegates, and allocation sources missing from the hot-path reference; for a focused explanation, read the matching paragraph only |
| [engine-rendering.md](references/engine-rendering.md) | Rendering, physics, asset memory, build size, loading, and Unity 6 features |
| [jit-il2cpp-tricks.md](references/jit-il2cpp-tricks.md) | Compiler-layer techniques: JIT / IL2CPP behavior and how to steer it (including unsafe as a last resort) |
| [jobs-burst-dots.md](references/jobs-burst-dots.md) | Job System / Burst / ECS: moving heavy computation off the main thread and vectorizing it |
| [memory-gc-internals.md](references/memory-gc-internals.md) | Extreme optimization at the memory layer: GC internals, struct layout, cache friendliness |
| [profiling.md](references/profiling.md) | The bottleneck isn't located yet, or the user needs to learn how to capture data |
| [span-collections-simd.md](references/span-collections-simd.md) | The Span family, collection internals, SIMD, and concurrency |
| [tencent-optimization-playbook.md](references/tencent-optimization-playbook.md) | Tencent field optimization handbook (integrating UPA / WeTest / Bugly official practice) |
| [ui-ugui-tmp.md](references/ui-ugui-tmp.md) | UGUI / TextMeshPro specific optimization |
| [wetest-bugly-fieldops.md](references/wetest-bugly-fieldops.md) | On-device acceptance and live-ops remediation: WeTest (PerfDog) + Bugly/CrashSight |

The references are validated criteria and standard implementations: a safety net and a source for citations, not a ceiling. Propose something better when you have it.

Related skills: unity-performance covers bottlenecks and engine optimization; csharp-zero-gc covers system allocation commitments and regression guards; code-standards covers conventions, design and orchestrated reviews. Load a sibling only when that distinct workflow is needed.
