---
paths: ["**/*.cs"]
---

# Unity C# write-time rules

Apply these whenever you write or edit Unity C# code. They are the plugin's C#/Unity hard rules in one place, so a writing task doesn't need the review protocol or the other languages' rules. Repository conventions take precedence over [DEFAULT] items; [HARD RULE] items are what a review will fail.

**Hot path** = runs every frame or at high frequency: Update/LateUpdate/FixedUpdate, coroutine loop bodies, combat, UI refresh, network send/receive, spawn/despawn peaks, and any path every user interaction goes through. Cold paths (editor tools, one-off scripts, initialization) put readability first.

## Before and after writing

- State the scope first: hot or cold, and which project conventions you follow.
- Hot-path code ships with its complexity, the upper bound of N, and its allocation profile (0 B/frame, or what allocates and when). [HARD RULE]
- New modules state their responsibility in one sentence, their dependency direction and their interface surface.

## Algorithms first (largest payoff)

- Think in complexity × call frequency × max N. An O(N) call per frame is O(60N) per second. [HARD RULE]
- No hidden O(N) inside loops: `List.Contains`/`Remove(item)`/`IndexOf` → HashSet/Dictionary, mark-then-compact, or swap-remove. [HARD RULE]
- Hoist invariants out of loops (`GetComponent`, config lookups); across frames use a cache plus a dirty flag. [HARD RULE]
- Precompute what you can, update incrementally instead of in full, react to events instead of polling.
- No full per-frame sort of a growable list; maintain order incrementally or keep a top-K heap. Early-out on success; coarse spatial pass first; compare `sqrMagnitude`, never `sqrt`/`magnitude`, on hot paths.

## Zero allocation on hot paths [HARD RULE: 0 B/frame]

- **Strings:** never concatenate, interpolate or `string.Format` per frame. Update text only when the value changes; use TMP `SetText("Gold: {0}", gold)`, a cached number-string table, or ZString. Compare with `StringComparison.Ordinal`. Convert hot string keys to int IDs at startup.
- **LINQ and `yield`:** banned on hot paths. Use `for` loops and reused lists.
- **Closures and delegates:** lambdas that capture allocate every call, and so does converting a method group to a delegate. Cache delegates in fields; use `static` lambdas with explicit state. `event +=`/`-=` reallocates the invocation list, so keep subscriptions off hot paths, or use interface callbacks over a preallocated list.
- **Temporary memory:** `stackalloc` + `Span<T>` for ≤512 B in the current frame; `ArrayPool<T>.Shared`, `ListPool<T>` and the other `UnityEngine.Pool` collection pools for larger or multi-frame buffers (always return them in `finally`/`using`); pre-allocated resident buffers for large, long-lived data.
- **Pre-size** every collection whose capacity you can predict (`new List<T>(cap)`); doubling growth leaves garbage arrays behind.
- **Resident memory has a budget.** For every pool, cache and pre-allocated buffer, state who owns it, its cap and what happens past the cap (grow once, reject, evict).
- **Pools have two sizes; keep them apart.** Warm-up count = the realistic simultaneous peak, created during loading, so memory isn't spent on a theoretical maximum per type (over-pooling trades GC spikes for a resident-memory blow-up on mobile). Cap (`maxSize`) = the hard upper bound that can ever be alive at once (e.g. the global alive limit), so anything beyond the warm-up grows once and is kept. A cap below the real peak makes the pool destroy on release and instantiate again on the next spike: recurring churn on the hot path.
- **Boxing:** passing a struct as an interface or `object`, `params object[]`, `Debug.Log(value)`, enum dictionary keys on legacy Mono, and `foreach` over an interface-typed collection, `Transform` or any non-generic `IEnumerable`. Iterate concrete types; use `childCount`/`GetChild(i)` for children.
- **Coroutines and async:** cache `WaitForSeconds` and other yield objects; `yield return null` is free. Prefer `Awaitable` (Unity 6+) or UniTask for new code; hot async must usually complete synchronously. `async void` only in event handlers.
- **Logging:** hot-path logs go through a `[Conditional]` method that is stripped in Release. `if (enabled) Log($"...")` still allocates when enabled. Check that the symbol really is undefined in Release before relying on it.

## Unity API discipline [HARD RULE]

- Cache `GetComponent`, `Camera.main`, `Transform` and other references outside loops; never `Find*`, `FindObjectOfType` or `SendMessage` on hot paths.
- Use the NonAlloc physics family with pre-allocated buffers, `GetComponents(List<T>)`, `Mesh.GetVertices(List<T>)`, `CompareTag`, and `Input.GetTouch(i)`. Avoid `.tag`/`.name` reads.
- Hash `Animator.StringToHash` and `Shader.PropertyToID` once into `static readonly int`; set per-renderer values with `MaterialPropertyBlock` instead of `renderer.material` (which instantiates a material).
- No `Instantiate`/`Destroy` churn: use `ObjectPool<T>` with a `maxSize` cap, warm it during loading, clear references on release, and cover every return path. No synchronous `Resources.Load` on interaction paths.
- Thousands of objects with their own `Update`: move to a manager that loops over them once per frame.

## Data and types

- Structs over 16 B are passed with `in`; `readonly struct` is the default form [DEFAULT]. Never use mutable structs as dictionary values or return them from properties.
- Hot calls on struct implementations use a generic constraint (`where T : IEffect`), not an interface-typed parameter (that boxes). Mark classes `sealed` when not designed for inheritance; avoid virtual or interface calls in inner loops.
- `throw` never on hot paths; expected failures return `bool TryXxx(out ...)` [DEFAULT]. Properties do O(1), side-effect-free reads only; anything heavier is a method (`Load…`, `Calc…`) [DEFAULT].

## Lifecycle and correctness [HARD RULE]

- Every subscription has a matching unsubscription (OnEnable/OnDisable); every borrowed or started thing (pool object, coroutine, tween, timer) is returned or stopped on completion, abort, repeat trigger and host destruction.
- Anything tracked by a manager, pool or registry stays correct when it is destroyed outside the API (direct `Destroy`, scene unload): unregister in `OnDestroy`. Objects that must call back into their manager get the reference when they're spawned or created, not through a global lookup.
- Callbacks that can outlive their host check liveness on their first line. No `?.` or `??` on `UnityEngine.Object`. Tap-triggered requests need in-flight protection that resets on success and failure.
- Errors are never silent: no empty `catch`, no logging-and-continuing into a bad state.
- One-directional dependencies: lower layers never reference upper ones (notify upward with events, callbacks or interfaces), and no circular references between modules. Single responsibility, expressible in one sentence.
- Across a module boundary expose interfaces or plain data, not implementation classes; parameters take the smallest capability they need.
- Named constants instead of magic numbers (find the authoritative definition first); no globally writable singletons or public mutable fields.
- Naming: one spelling per element across the repo; names carry units and spaces (`TimeoutMs`, `posWorld`); booleans read as positive questions (`IsAlive`, `HasLoaded`); function names are honest verb + object, with side effects in the name.
- [DEFAULT] Functions ≤50 lines, ≤4 parameters, ≤3 nesting levels; comments explain why.

## Go deeper only when the task needs it

- Collection choice, space budgets, data layout: code-standards' algorithm-efficiency reference.
- Pattern choice, module boundaries, naming details: code-standards' design-patterns, cohesion-coupling and naming-conventions references.
- Measuring, profiling, rendering, UI rebuilds, Jobs/Burst, Span/SIMD, IL2CPP: the unity-performance skill.
- Making a whole system allocation-free with regression guards: the csharp-zero-gc skill.
