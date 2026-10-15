# C# coding standards (Unity client)

This skill has two uses: setting the standard while writing code (sections 1–3 of this file), and running the [review protocol](review-protocol.md) during a review.

Its scope is C# and Unity. The reference files also carry the rules for Go, C++, Java, and Lua — consult those only when you are explicitly reviewing one of those languages. The protocol structure carries over, but perspective C in step 1 (asset and configuration evidence) is Unity-specific and must be swapped for that language's equivalent evidence dimension.

The core of the review protocol is its structure — parallel multi-perspective passes plus an independent final review — not the checklist. It is more precise and covers more than a single agent reading straight through, so don't skip the protocol and just read the checklist.

## 0. Precedence and applicability

A project's existing conventions take precedence over this skill's defaults. When you pick up a repository, first look for `.editorconfig` and analyzer configuration, `gofmt` and lint configuration, `.clang-format`, checkstyle, and the project's own documentation (`CLAUDE.md`, README, `.cursor/rules/`, and so on). Standards are often written in non-`.md` extensions like `.mdc`, so read the repository index before asserting "there is no standard." Once found, it governs, and citing its clauses requires the verbatim line number.

Rules come in two tiers: violating one marked [HARD RULE] fails the review; ones marked [DEFAULT] apply when the project has no convention of its own.

Hot paths (frame loop, combat, network send/receive, high QPS) enforce all performance clauses, and any path that every user interaction must traverse falls under the same clauses. The cold-path exemption covers only editor tooling, one-off scripts, and initialization code.

## 1. Goals for every line you write

The goals must be met; the approach is yours.

1. **Peak algorithmic efficiency**: think about the optimal order of magnitude before you start. What can be precomputed isn't computed at runtime, what can be incremental isn't done in full, what can be event-driven isn't polled.
2. **Space discipline**: choose by access pattern, allocate by budget. Predictable capacities must be pre-set; caches must have a cap and an invalidation policy.
3. **Zero GC on hot paths**: zero allocation within a frame in C# — eliminate boxing, closures, LINQ, string concatenation, and temporary collections. For per-language specifics see [references/language-hard-rules.md](language-hard-rules.md).
4. **High cohesion, low coupling**: single responsibility, one-directional dependencies. For the criteria see [references/cohesion-coupling.md](cohesion-coupling.md).
5. **Consistent naming and style**: names must read as semantics, carrying units and direction. For C# specifics see [references/naming-conventions.md](naming-conventions.md).

## 2. Universal hard rules

Writing code and reviewing code share these criteria.

1. [HARD RULE] **Hot-path complexity declaration**: hot-path functions with two or more levels of nesting, or that process collections, state their complexity and the upper bound of N.
2. [HARD RULE] **No unexpected allocation within a frame or within a request.**
3. [HARD RULE] **One-directional dependencies**: lower layers don't reference upper layers; reverse dependencies are decoupled by pushing an event or interface downward.
4. [HARD RULE] **Single responsibility, expressible in one sentence.**
5. [HARD RULE] **Errors are never silent**: no empty catch, no ignored error, no logging-and-continuing into a bad state. Failure paths must produce UI or state feedback, or carry an explicit comment on why they're ignorable.
6. [HARD RULE] **Magic numbers get names**: when you see a magic number, search for its authoritative definition (protocol, constant table) first — using the wrong carrier is far worse than not naming it at all.
7. [HARD RULE] **Minimize mutable shared state**: globally writable singletons, public mutable fields, and bare cross-thread sharing are rejected outright.
8. [DEFAULT] Functions no longer than 50 lines, no more than 4 parameters, no more than 3 levels of nesting; comments explain *why*; in C#, every type and member is documented as in `unity-write-rules.md` (Documentation section).
9. [HARD RULE] **Lifecycle and async ordering**: for every combination of an async process (coroutine, tween, callback, timer) and a state flag, check the abort paths one by one. A callback that outlives its host needs a liveness guard on its first line. `?.` is banned on UnityEngine.Object. Any entry point that fires a request on tap needs in-flight protection that resets on both success and failure. Cleanup order must be reviewed — base before self, `Clear()` before iterating, and similar patterns are "done but ineffective."
10. [HARD RULE] **Signal source trustworthiness**: event-driven progression requires a bidirectional audit for false negatives and false positives (under what conditions is it not fired, under what conditions is it fired wrongly). Global broadcasts are checked subscriber by subscriber.
11. [DEFAULT] **Consistent handling of the same state across multiple sites**: when you find twin implementations, list the feature points first and compare them item by item — don't report only the difference you happened to bump into.

For design judgments (pattern selection, collection selection, module boundaries) see [references/design-patterns.md](design-patterns.md) and [references/algorithm-efficiency.md](algorithm-efficiency.md).

## 3. Output when writing code or defining standards

**When writing code**, state the applicable scope before you start (language, hot/cold determination, project conventions being followed). Hot-path deliverables carry a complexity declaration and their allocation profile. New modules carry their responsibility boundary, dependency direction, and interface surface.

**When defining standards**, first survey the repository's current state and produce three columns: keep / add / correct. The deliverable must include toolchain configuration — documentation alone counts as incomplete.
