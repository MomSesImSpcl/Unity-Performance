# Language-specific hard rules (C#/Unity · Go · C++ · Java · Lua)

Beyond the four universal pillars, each language has its own rules where a violation reliably causes an incident. This file collects only the hard rules and hot-path disciplines; it is not a language tutorial.

## §1 C# / Unity

**Zero-GC clauses (the everyday-coding version; for systematic remediation switch to the csharp-zero-gc skill):**

1. **[HARD RULE] Hot paths (Update / combat / UI refresh / network send-receive) hit GC Alloc = 0 B within a frame.** Check the five allocation sources by default: string concatenation; LINQ; closure capture (require a static lambda or explicit state); temporary collections (use the three-tier buffer strategy: `stackalloc` ≤512 B → ArrayPool/ListPool → resident pre-allocation); boxing (a struct passed as an interface, an enum used as a dictionary key, `params`).
2. **[HARD RULE] Struct parameter passing**: structs larger than 16 B are passed with `in`; hot-path calls on struct implementations go through a generic constraint (`where T : IEffect`), never an interface-typed parameter (which boxes).
3. **[HARD RULE] Unity API discipline**: cache `GetComponent` / `Camera.main` outside loops; use the NonAlloc physics family; compare tags with `CompareTag`; no `Find` / `SendMessage` on hot paths; cache and reuse coroutine `yield` objects, and prefer UniTask/Awaitable for new code.
4. **[DEFAULT] Properties do O(1) side-effect-free reads only**; anything with IO or computation is renamed to a method (`Load…` / `Calc…`).
5. **[DEFAULT] `readonly struct` with `readonly` fields is the default form**; mutable structs may not be used as dictionary values or returned from properties (copy-semantics traps).
6. **[DEFAULT] Exceptions are for exceptional cases only**: expected failures (not found, validation failed) return `bool TryXxx(out)` or a Result type. `try`/`catch` on a hot path is acceptable; `throw` is not.
7. **Event and delegate subscriptions must be paired with unsubscription** (symmetrically in OnEnable/OnDisable in Unity), otherwise you get leaks plus ghost callbacks. `async void` is permitted only in event handlers; everything else is `async UniTask/Task`.

## §2 Go

1. **[HARD RULE] Handle every error**: discarding an error with `_ =` requires a comment explaining why it's safe; test with `errors.Is/As`, and wrap with `fmt.Errorf("ctx: %w", err)` to preserve the chain. Never use panic for business control flow (panic is reserved for unrecoverable programming errors, with a single recover at the boundary that logs).
2. **[HARD RULE] Every goroutine has an owner**: for every `go`, you must be able to answer "who waits for it to finish, and how is it told to exit" (`context` cancellation + `WaitGroup` / `errgroup`). A bare `go func(){}()` with no exit mechanism is a leak — rejected.
3. **[HARD RULE] Shared data either transfers ownership through a channel or is locked**; concurrent map read/write panics outright — use `sync.RWMutex` for read-heavy access and shard to reduce contention; put `-race` in CI.
4. **[DEFAULT] Control escapes on hot paths**: on high-QPS paths prefer value returns or filling a passed-in pointer, avoiding a new pointer escaping to the heap; reuse request-scoped temporaries (buffers, codecs) with `sync.Pool`; `pprof` allocs is the acceptance measure.
5. **[DEFAULT] Interfaces are defined on the consumer's side and kept small** (1–3 methods); accept interfaces, return concrete types.
6. **[DEFAULT] Defend against slice traps**: when a function retains a slice passed to it, copy explicitly (the shared-backing-array trap); the result of `append` must be assigned; holding a small sub-slice of a large array long-term pins the whole block — copy it out.
7. Write the deferred release immediately after the acquisition; watch out for `defer` accumulating inside a loop (its scope is the function).

## §3 C++

1. **[HARD RULE] Ownership is explicit**: all resources are RAII; `unique_ptr` by default, `shared_ptr` only for genuinely shared ownership (and never copied by value on a hot path — atomic refcounting). **Raw `new`/`delete` in business code is zero-tolerance**, and raw pointers express only "borrowed, not owned."
2. **[HARD RULE] Zero heap allocation on hot paths**: pre-allocate + `reserve` + object pools/arenas (a frame allocator: reset at frame start, bump-pointer allocation within the frame, no individual frees); reuse containers with `clear()` rather than rebuilding them.
3. **[HARD RULE] Lifetime red line**: `string_view` / `span` / iterators / references must not point at a container whose capacity may change, or at an already-dead temporary; a function returning a reference must be able to prove in one sentence that the referent outlives the caller.
4. **[DEFAULT] Value semantics first, plus moves**: read-only parameters take `const&` (small objects by value); taking ownership takes by value + `std::move`; types implementing a move constructor follow the rule of five/zero.
5. **[DEFAULT] Full const correctness**: member functions are const wherever they can be; `constexpr` whatever can be computed at compile time.
6. **[DEFAULT] Compile-time defenses**: `-Wall -Wextra -Werror -Wshadow`; `clang-tidy` in CI; use `at()` or assertions in high-risk out-of-bounds areas, and run tests in Debug with sanitizers (ASan/UBSan).
7. In million-iteration hot loops, replace virtual functions with concrete-type dispatch or CRTP (patterns §3, hot-path exemption); use forward declarations in headers to reduce compile coupling, but do the real split for circular dependencies (cohesion §2).

## §4 Java

1. **[HARD RULE] Avoid autoboxing on hot paths**: on high-frequency paths, replace `List<Integer>` / `Map<Long,V>` with primitive arrays or a primitive collection library (fastutil, Eclipse Collections); boxing and unboxing inside a loop is a major invisible allocator.
2. **[HARD RULE] Concurrency discipline for mutable shared state**: prefer immutability (records, final fields); use the `java.util.concurrent` family for shared containers, never a bare HashMap under concurrency; document lock granularity and ordering, and never acquire nested locks out of order.
3. **[DEFAULT] GC remediation follows the same shape as C#**: pool or reuse high-frequency temporaries (request contexts, codec buffers) via ThreadLocal; use a reused `StringBuilder(cap)` for string concatenation in loops; keep Stream chains off hot paths (use a for loop), while low-frequency code can do as it likes. Acceptance uses GC logs / JFR allocation profiling, not intuition.
4. **[DEFAULT] try-with-resources everywhere**; layer exceptions: convert checked exceptions to runtime exceptions with context at the boundary, never empty-catch, and never use exceptions for control flow.
5. **[DEFAULT] Give collections an initial capacity**; `equals`/`hashCode` come in pairs and use immutable fields; the fields of an object used as a HashMap key may not be mutated afterwards.
6. API surface discipline: return an immutable wrapper or a copy of a collection; never hand out the internal collection raw (which lets outsiders mutate your internals).

## §5 Lua (game scripting / hot update, LuaJIT / xlua contexts)

1. **[HARD RULE] No new global variables**: everything is `local`; modules are funneled through `local M = {} … return M`. The project should enable global-access checking (strict.lua, or an `_ENV` metatable interceptor) — a misspelled variable name silently becoming a global is Lua's number-one pitfall.
2. **[HARD RULE] Zero creation within a frame**: Lua has a GC too — on hot paths (per-frame callbacks, combat logic) don't create tables, closures, or strings. Pool or reuse tables (`table.clear` or manually clearing fields); create callback closures once during initialization and hold the reference, never write an anonymous function inside Update; build strings in one shot with `table.concat` or `string.format`, never `..` in a loop.
3. **[HARD RULE] Cross-language bridging (xlua/tolua ↔ C#) is an extremely expensive call**: no multiple crossings per frame on a hot path — batch and pass once; passing tables or strings across the boundary has marshaling cost, so high-frequency data goes through numeric parameters or a shared buffer; cache and reuse the delegate/function references for C#-calls-Lua and Lua-calls-C#, never fetch them fresh each time.
4. **[DEFAULT] Iterate arrays with a numeric for or `ipairs`**, never `pairs` on an array (order isn't guaranteed and LuaJIT can't compile a `pairs` hot loop); keep array indices contiguous with no holes (setting nil punches a hole that breaks both the length operator and iteration — use swap-remove or a marking scheme).
5. **[DEFAULT] Hoist frequently accessed library functions and table fields into locals** (`local sqrt = math.sqrt`), and lift multi-level lookups (`a.b.c.d`) out of hot loops.
6. **[DEFAULT] Hot-update discipline**: a hot-updatable module must not hand out copies of function references at load time for others to hold long-term (old references don't update after a hot patch) — cross-module calls go through the `M.func()` table-lookup form. Separate module-level state from logic so a hot update swaps only the logic table while the state table is retained and migrated.
7. Error handling: at the boundaries (network callbacks, UI event entry points) use a uniform `pcall` / `xpcall` + traceback report; don't nest pcall through the inner logic (it swallows errors and allocates). Pre-build `error` context strings on cold paths.

## §6 Cross-language collaboration clauses (client C#/Lua ↔ server Go/C++/Java)

1. **The protocol is the only contract**: field naming, units, and value ranges follow the protocol definition, with each side generating or mapping from it — never hand-copying fields. Protocol changes go through "add a field + version tolerance," never by changing the meaning of an old field (cohesion §3).
2. **Time is uniformly an integer millisecond UTC timestamp** over the wire; display time zones are converted only in the presentation layer.
3. **Currency and resource quantities use integer minimal units** (cents, coppers) — no floats over the wire; deterministic data such as random seeds and logic frame numbers use integers.
4. All tiers share one error-code table (a generated artifact); magic-number error codes scattered around are banned.
