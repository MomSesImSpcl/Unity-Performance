# C# zero-GC engineering plans

Zero GC is not a pile of tricks; it is an engineering commitment: which paths are promised allocation-free, how that is accepted, and how it is still zero six months from now. This skill pins down three things — the target, the acceptance definition, and the guardrail requirement. How you get there is yours to design: the allocation-free techniques you know, the newer language features (Span, ref struct, params collections, interceptors, source generators, and whatever is newer), and the library ecosystem are all more complete and more current than any list here. Zero GC without guardrails gets eaten away by everyday commits, so preventing regressions matters as much as getting to zero.

## 1. Target tiers

Declare the commitment before you start. The following are non-negotiable acceptance criteria.

| Tier | Commitment | Applies to | Acceptance definition |
|------|------|------|---------|
| L1 Peak controlled | Allocation is concentrated in the loading phase; runtime peak stays within the device's memory budget | The floor for every project | PerfDog PSS peak passes; steps in the Mono Reserved curve appear only on loading frames |
| L2 Zero B/frame on hot paths | Combat, main loop, UI refresh, and network send/receive allocate 0 GC bytes within a frame | The target for the vast majority of games; standard | Profiler GC Alloc column stays at 0 B; CI allocation assertions all green |
| L3 Zero B throughout | No code path allocates after the loading screen; GC can be turned off | Lockstep, competitive, VR — genres with zero tolerance for spikes | Over an N-minute soak, the delta in GC.CollectionCount is 0; memory stays flat during the GC-off window |

Declare the tier before starting work: L2 and L3 differ by an order of magnitude in cost (L3 requires third-party libraries and SDKs to be allocation-free too, which constrains your options). For most projects the right answer is L2 plus localized L3 (for example, the lockstep simulation frame).

## 2. The five-step rollout

This is a fallback skeleton, not a process straitjacket. If you judge that a better path exists (upgrade libraries before stopping the bleeding, drive vertically through one subsystem at a time, or a route you designed yourself), you may reorder, merge, add, or drop steps — just state why. Only two things are non-negotiable: the acceptance definition for the declared tier must be met, and the guardrails must land.

1. **Measure the baseline.** With the Profiler (on-device Development Build), sort by GC Alloc to capture the top 20 allocation sites and the per-frame allocation curve, then define the hot-path list — which systems commit to L2, which to L3.
2. **Stop the bleeding at the top.** The top 20 is usually saturated by five categories: strings, LINQ, closures, Instantiate, and missing NonAlloc overloads. Zero them out one by one, prioritizing functions that are both time-expensive and allocation-heavy. This step alone often removes most of the allocation volume.
3. **Structural replacement.** Point fixes rebound. Promote high-frequency allocation shapes into architectural patterns (a unified pool-family entry point, a tiered buffer strategy, allocation-free events and messages, a string system, frame data structures). Which patterns you use is your call; for the accumulated standard implementations see [references/zero-alloc-patterns.md](zero-alloc-patterns.md) — use them directly or propose something better.
4. **Library upgrades.** Swap heavy-allocating subsystems wholesale for allocation-free implementations. For validated choices (UniTask and Awaitable, ZString, ZLinq, MemoryPack, LitMotion) see [references/zero-alloc-libraries.md](zero-alloc-libraries.md). If you know a better or newer library, propose it proactively; just give the selection rationale (magnitude of the problem solved, AOT and IL2CPP compatibility, maintenance status).
5. **Solidify the guardrails.** A Roslyn Analyzer with per-directory severity tiers + CI allocation assertions + a PR review checklist; see [references/guardrails.md](guardrails.md). **Without step 5, the zero-GC plan is not complete.**

When the target project won't run (read-only repo, no runtime, no Profiler), step 1 is not a gate — switch criteria and keep going, and don't report less because of it. Rank allocation sites using a statically verifiable triple: frequency (follow the call chain to confirm whether it's per frame, per refresh, per tap, or one-time init — dirty-flag coalescing is not per frame), multiplier (is it inside a loop, multiplied by N — and get evidence bounding N), and per-occurrence allocation shape (how many `object[]`, how many boxes, how many new strings, how many new collections). With the triple in hand the item goes on the list as usual, marked "pending on-device Profiler confirmation." Lacking baseline data is not grounds for omitting anything; the acceptance trio in [reporting](reporting.md) simply moves to post-implementation measurement instead of being a precondition for producing the list.
