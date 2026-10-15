## Review method

Read this for any project-code review or optimization. Work in this order: explore with the operators, sweep the coverage dimensions for misses, then declare the coverage inventory.

## Contents
- Exploration operators
- Coverage dimensions
- Coverage inventory and runtime premises

### Exploration operators

A checklist cannot exhaust the problem space of real code. Run any code through the six thinking operators below first; use the checklist only as the last step before delivery, to catch omissions.

**Lifecycle symmetry audit.** For everything that gets created, registered, started, or borrowed (objects, event subscriptions, coroutines, Tasks, timers, timeout closures, pooled objects, message handlers, tweens, runtime-instantiated GameObjects and loaded assets), ask who is responsible for destroying, unregistering, stopping, or returning it along four paths: normal completion, exceptional abort, repeated trigger, and host destruction. No symmetric counterpart is a finding. When you do find one, also audit the ordering and coverage of the cleanup: calling `Clear()` on a container before iterating it to return items, nulling a field before using it to finalize, exception paths that bypass the return, returning only "the current one" while missing the rest of the collection — **the existence of return code does not mean every borrowed object gets returned.** These gaps don't throw and don't crash; they show up only as monotonically growing resource use. For creation on a repeat-trigger path, add one more question: "on the Nth trigger, where are the previous N-1?" Hiding is not the end of a lifecycle: hidden ≠ destroyed ≠ returned.

**Interrogate the underlying cost.** For any call whose cost is unclear, ask "what does this actually do underneath," then read the implementation or check the docs to confirm — is it JNI? A synchronous disk flush? A stack capture? A full-tree walk? Rebuilding every binding? No confirmation, no conclusion. Fan-out state-refresh chains must be followed one hop in: those `SetXXX` methods that run "per action or per round × N instances" usually hide their real cost inside the in-house setters, helpers, and partial components they call (a SetActive off-then-on rebuild, a fresh coroutine each time, GetComponent round trips, dead branches — all outside the main file). **A clean main file does not mean a clean chain.** If you haven't followed it in, don't conclude "no issues" on that chain.

**Timeline simulation.** Run the code in your head at three scales: one user action (the cascade ledger — how many times does it actually execute?), one business cycle (a match or a login — repetition and races), and a one-hour session (accumulation, containers that only grow, high-water marks). Problems invisible to static line-by-line reading become visible under simulation.

**Reachability and zero-reference determination.** A type or member can be referenced in far more ways than one: serialized attachment (GUIDs in prefabs and scenes), static code references (`new`, type names, generic arguments), runtime dynamic attachment (`AddComponent<T>` / `GetComponent<T>`, often buried in utility extension methods), reflection and string-name lookup, config tables and asset paths and event registries, and indirect retention via `link.xml`, Analyzers, and Timeline/Animator events. Checking one or two of these and declaring "dead code" will condemn live code. **The evidence bar for declaring something dead must be higher than for declaring it alive** — recommending deletion is irreversible, while declaring it alive costs you at most a little missed savings. When unsure, write "no attachment reference found; confirm dynamic attachment points before deleting." When enumerating reference carriers, the most commonly missed ones are the module's own sibling files and indirect dispatch at the framework layer (events bubbling upward, base classes auto-adding components during initialization, message dispatch).

This operator has an equally important reverse use: before you account for a path and rank it, confirm it is actually reached in the current build. Declaring something dead answers "can this be deleted"; reachability also decides "is this worth optimizing" — for a path that never executes, however precisely you compute the cost, you are pointing the budget at thin air and crowding out real findings. The causes are mundane: an enum's value range commented down to a single member, a second config or registration commented out wholesale, a switch constant that is always the same value, `if (current == target) return;` being always true over a single-value domain. Before writing "the ledger for one action," ask "can the value that triggers it even be produced in the current code?" By the same token, views and components whose entry points are all commented out or have zero callers don't go on the optimization list.

**Contract consistency check.** The moment you find a convention (a pool's borrow/return interface, a `HasInstance` guard, register/unregister pairing, a flag's set/reset, a comment saying "must go through this entry point"), grep every call site and check adherence. A convention existing does not mean the convention is followed — the exemplar and the violation are often in the same file.

**Adversarial self-check.** Before delivering, ask yourself: what would a stronger reviewer find that I didn't write down? Which dimension has zero findings from me — is there genuinely nothing, or did I not look? Fold the answers back into the report before handing it over.

Order discipline: checklist comparison, coverage matrices, closure statements, and self-check declarations are omission-catching tools, not a way to produce findings. **Explore freely first, then verify systematically** — start as if no checklist exists and read problems out of the code using the operators and your instincts; then go item by item against the checklist and the matrix to catch what you missed; write the declaration last. Doing it in the other order finds only what is already on the checklist.

### Coverage dimensions

For each dimension, ask yourself "did I bring all of my knowledge to bear at this level?"

**Algorithms and data structures always come first** — the order-of-magnitude payoff is the largest. Don't settle for picking at API usage line by line. Abstract the business logic down to its algorithmic essence first (hand-type search is subsequence enumeration, connectivity is union-find, bulk range updates is a difference array, sliding-window statistics is a monotonic queue, dependency resolution is a topological sort), then use your full algorithmic repertoire to present complexity-compared options. Watch for redundant computation at the same time — recomputing invariant results, processing an incremental problem in full, polling a low-frequency event, iterating in the wrong direction. The corresponding weapons are caching plus dirty flags, incremental updates, event-driven design, and reversed precomputation. When n is small, constants and cache friendliness matter more than complexity.

**User-perceived latency** requires you to stop looking at code purely through CPU and GC eyes. Fixed wait windows (double-click detection, debounce delays, animations that lock input), serial waits (having to wait for a response before reacting to a tap), and artificial throttling never show up in the Profiler's GC column, yet they directly determine how the game feels. When reviewing an interaction path, compute the "from user action to visible response" time ledger separately — a few hundred milliseconds of fixed delay is often worth far more than saving a few KB of allocation.

**Memory and allocation**: catch every implicit allocation on a hot path (boxing, closures, LINQ, strings, temporary collections, non-NonAlloc APIs). For systematic remediation, hand off to the sibling skill csharp-zero-gc.

**Engine layer**: DrawCalls and batching, overdraw, material instantiation traps, physics configuration, asset loading (sync to async, Addressables, spreading across frames), Instantiate pooling. Proactively consider the dividends of newer Unity versions (GPU Resident Drawer, GPU occlusion culling, STP upscaling, Awaitable, InstantiateAsync, and newer features) and recommend what the user's version supports. Before concluding "no issues at the engine layer," you must have specifically checked: Animator usage (Rebind abuse, string parameters, how animation waits are done), tween lifecycles (linkage to the host, Kill on destroy, callbacks after destruction), the failure paths of polling waits, and the generation and cancellation of one-shot timeouts and delayed closures (request timeout fallbacks, delayed calls, repeatedly triggerable wait coroutines — one by one). Also particle and VFX residency (cleanup is layered — on leaving a scene clear instances but keep templates; on a low-memory callback clear everything; don't treat "we cleaned up" as a pass). Not seeing Find/GetComponent does not mean the engine layer is clean.

**UI (UGUI/TMP)**: Canvas rebuild storms, static/dynamic separation, virtualized scroll lists, the rebuild cost of SetActive, TMP mesh updates. Frame drops when opening a view and list stutter should be investigated here first.

**Parallelism and pushing work down**: for large volumes of homogeneous computation (pathfinding, batched raycasts, procedural generation, large unit counts), proactively recommend Job System + Burst + NativeArray, and don't be afraid to recommend ECS where it fits.

**Frontier and ecosystem**: community-proven zero-allocation and high-performance libraries (UniTask, ZString, ZLinq, MemoryPack, LitMotion, and newer options) should be introduced proactively where they fit, with the selection rationale stated.

If the user asked only about A but you can see significant opportunities in dimensions B and C in the code, you must raise those too, labeled as proactive findings and kept distinct from what was asked.

### Coverage inventory and runtime premises

Before delivery, declare "checked" or "not applicable" for each layer. The gap between covering all six layers and only sweeping the code layer is not ability — it's not having thought to look. Confirming each layer costs almost nothing.

| Layer | What to catch | How to get evidence |
|---|---|---|
| Code | Allocation, algorithmic complexity, call frequency, lifecycle symmetry | Source + call chain |
| Prefabs | Redundant components, Mask vs RectMask2D choice, raycastTarget ratio, Canvas partitioning, resident particles and Animators | `.prefab` grep counts |
| Texture / audio / video import | Max size and platform overrides, mipmaps, Read-Write; audio loadType, bitrate and channels; video transcoding | Bulk grep over `.meta` |
| Project settings | Scripting Defines (is the logging macro really stripped), graphics API, default compression format, stripping, incremental GC | Assets under `ProjectSettings` |
| Build configuration | Whole-directory collection pulling zero-reference assets into the build; whether bundles are split by language and purpose | AssetBundle collector config |
| Framework layer | Shared code this module touches (lists, events, loaders) — one fix multiplied across the whole project | Walk up the call chain |

Establish the execution-layer premises first, then prune based on them: before touching anything, confirm the scripting backend (IL2CPP / Mono / hot-update interpreter), whether unsafe is allowed, the C# language version, and the target platform's graphics API. These premises can eliminate entire classes of recommendation in one shot (hand-rolled loops replacing the BCL can be a regression under an interpreter; without unsafe, Span and stackalloc are off the table entirely) — far cheaper than checking every item and only then discovering it doesn't apply. Before recommending a technique whose support depends on the runtime (Span, stackalloc, unsafe, SIMD, inlining, new value-type generics, hot-update assemblies) or choosing which optimization layer to work on, read the [runtime ladder and compatibility matrix](runtime-ladder.md).

