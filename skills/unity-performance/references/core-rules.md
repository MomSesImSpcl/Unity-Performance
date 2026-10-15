# Unity performance optimization

This skill sets the targets, establishes the disciplines, and points at what is easy to miss. The actual optimization ability comes from your own algorithmic repertoire, your understanding of engine internals, and the community practice you know. The reference files are a safety-net sweep before delivery, not a ceiling on what you produce. If every finding in a pass maps to a numbered checklist entry, that usually doesn't mean the code is clean — it means you didn't explore enough.

## 1. Acceptance criteria

Four non-negotiable targets. Every piece of performance work is accepted against them.

- **Frame budget**: 60 FPS means 16.6 ms per frame, 30 FPS means 33.3 ms. Every optimization must answer "where does this frame's time get saved."
- **Zero GC on hot paths**: code that runs every frame (Update, LateUpdate, coroutine bodies, UI refreshes, network packet handling) must hit GC Alloc = 0 B/frame. This is a hard standard, not a best effort.
- **Correct algorithmic order**: hot-path complexity must match the data scale. O(n²) paired with an n that can grow is a defect unless you produce evidence bounding n.
- **Passes on device**: the final measure is measured frame rate, PSS peak, and thermals on the target low-end device — not editor numbers.

## 2. Five iron rules

Violate any one of them and the optimization is redone.

1. Measure before you touch. Take evidence with the Profiler (on device + Development Build) before optimizing, and re-measure the same scene after. Don't change code on a hunch: without a before/after measurement you can't tell a win from a regression. The only exception is fixing deterministic anti-patterns that are guaranteed wins and need no data.
2. Measure on the target device. The editor adds its own overhead, and Mono and IL2CPP behave differently. Editor numbers don't count.
3. Don't change things to show off. Run every change through three applicability questions — can you argue its correctness (give the boundary cases)? How large is the blast radius? Is the readability cost worth it? If it fails, say plainly "the current implementation is good enough."
4. Optimization must not create new debt. Indexes, lookup tables, and heaps introduced by an algorithmic fix must be pre-allocated, reused, and capped. Don't fix an O(n²) problem by creating a "new dictionary every frame" problem. Accept on both columns: time and GC Alloc.
5. Verify configuration claims. Whenever a conclusion depends on a compile switch, a macro, or build configuration (whether `[Conditional]` gets stripped, whether the logging macro is defined, Debug vs Release differences, Scripting Define values), check the project's actual configuration before concluding. Don't make hypothetical claims like "it should get stripped in the release build": the real state of a macro frequently invalidates the premise of an entire analysis.
