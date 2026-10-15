# Algorithmic efficiency and space discipline

Principle: **measure before you optimize, but don't take on debt in your choices** — picking the right data structure and complexity the first time is free; fixing a wrong one later costs ten times as much. On cold paths, write whatever is clearest. Every clause in this file targets hot paths (frame loop, combat resolution, network send/receive, high-QPS endpoints, bulk data processing).

## §1 Complexity discipline

1. **[HARD RULE] Compute complexity × frequency together**: an O(N) call inside a per-frame path is O(N×60)/second. What a review looks at is the triple product "per-call complexity × call frequency × upper bound of N." If any of the three is unclear, ask before merging.
2. **[HARD RULE] No hidden O(N) inside loops**: `list.Contains` / `Remove(item)`, string `Find`, `table.remove(t,1)` (Lua head removal), `vector::erase` in the middle — inside a loop these are O(N²). Fixes: switch to a hash/set, mark in bulk then compact once, or swap-remove (when order doesn't matter).
3. **[HARD RULE] No recomputing invariants on hot paths**: hoist calls whose result doesn't change (`GetComponent`, config table lookups, `strlen`-style length queries) out of the loop; for values invariant across frames, use a cache plus a dirty flag (patterns §1, dirty flag).
4. **[DEFAULT] Sorting on a hot path with growable N must be justified**: full per-frame sorting is rejected; switch to incremental maintenance (insertion sort is O(N) on nearly-sorted data; bucket/radix by key distribution; or maintain only a top-K heap).
5. **[DEFAULT] Design early-outs and pruning explicitly**: break as soon as you find it; spatial queries do a coarse pass first (grid / bounding box / squared distance) then the precise computation; compare distances squared — no `sqrt` on hot paths.
6. **[DEFAULT] Think in amortized terms**: a one-time large cost can be amortized (pre-sort to enable binary search, pre-build an index to enable O(1) lookup); write the amortized cost into a comment (when it's rebuilt, who triggers it).

## §2 Data structure selection table (by access pattern, not by habit)

| Access pattern | Choose | Don't choose | Notes |
|----------|-----|------|------|
| Mostly sequential iteration, insert/remove at the tail | Array / `List<T>` / `vector` / slice (with pre-allocated capacity) | Linked list | Cache contiguity beats everything; on modern CPUs a linked list is almost always wrong |
| Lookup by key, large N (> ~64) | Hash table (with estimated capacity) | Linear scan | Estimate capacity to avoid rehashing; never build a temporary table on a hot path |
| Lookup by key, small N (≤ ~64) and hot | Sorted array + binary search, or just a linear scan | Hash table | At small N a linear scan beats hashing (no hash cost, cache-friendly); let the data decide |
| Key is a small-range integer or enum | Direct array indexing | Hash table | `costs[(int)ItemType.Weapon]`; the fastest hash is no hash |
| Frequent insertion/removal at both ends | Ring buffer / `Deque` | Array with head insert/remove | The standard answer for network buffers and sliding windows |
| Need sorted iteration + fast lookup | Sorted array + binary search; consider a tree only when writes greatly outnumber reads | Sorting on every read | C# `SortedDictionary` / red-black trees often lose to "batch up, then sort once" |
| Membership testing (is it in there) | Bitmap / bitset (when keys map to small integers) > HashSet | List.Contains | A bitmap compresses space 64× and supports word-at-a-time batch operations |
| Priority extraction | Binary heap | Full scan or full sort each time | Timer wheels, pathfinding open lists; a fixed-capacity array heap allocates nothing |
| Multidimensional spatial queries | Uniform grid (first choice) > quadtree / KD-tree | All-pairs O(N²) | When game objects are evenly distributed a grid is simpler and more cache-friendly; don't start with a tree |
| Frequent insertion/removal + iteration | Swap-remove array, or "tombstone marking + periodic compaction" | Removing during iteration | Also solves iterator invalidation |

**[HARD RULE] Containers with predictable capacity must be pre-allocated** (`new List<T>(cap)`, `make([]T,0,cap)`, `reserve(cap)`, Java `new ArrayList<>(cap)`, reusing a Lua table). The relocation and garbage arrays produced by doubling growth are a hidden major cost common to every language.

## §3 Space discipline (extreme space efficiency = spending to a budget)

1. **[HARD RULE] Large resident memory needs a budget table**: for pools, caches, and pre-allocated buffers, write down who owns each, what the cap is, and the over-limit policy (LRU eviction / rejection / alerting). "Over-pooling trades GC pressure for a resident-memory explosion" is a real risk (csharp-zero-gc §4.4).
2. **[DEFAULT] Order fields by size to compress padding** (C#/C++ structs): under 8-byte alignment put doubles and references first and cluster bools/bytes at the end; write the `sizeof` of hot structs into a comment and re-check it when fields change. For structs held in arrays (tens of thousands+), this alone can save an entire cache line.
3. **[DEFAULT] Pack enums and flags into bits**: a group of bools becomes a `[Flags]` enum / bitfield / bitset; state fields use the smallest sufficient type (short/byte) — but **don't micro-optimize a single local**. Space discipline applies to "structs copied N times" and "resident collections," not to stack temporaries.
4. **[DEFAULT] Share the immutable, externalize the mutable** (flyweight): config data lives once globally as a read-only reference, and instances hold only the differences; when strings repeat heavily, use interning or a string table (protocol field names and event names especially).
5. **[DEFAULT] Sparse data uses sparse structures**: a 10,000-cell map with a few dozen entities uses `Dictionary<coord, entity>`, not a 2-D array. Conversely, never use a dictionary to hold what is really an array of dense data.
6. **Serialization and transport**: no JSON on hot protocols (it loses on both size and allocation); use binary (MemoryPack / proto / a hand-rolled Span reader-writer); use varints for fields; maintain version compatibility by adding fields, never by changing the meaning of old ones.

## §4 Cache friendliness and data layout (the last notch of squeezing)

The test: **performance comes from "sequential access over contiguous memory," not from "a cleverer single-point algorithm."** You only need this notch for per-frame batch processing of thousands of items or more. When you get here:

- **SoA instead of AoS**: if a per-frame pass only touches position, put positions in their own array — don't drag a 128-byte entity struct through the cache.
- **Hot/cold separation**: split the fields read every frame (pos/vel/flags) from the occasionally read ones (name, description, callbacks) into two structs linked by index.
- **Branch elimination**: pre-bucket the `if` inside a hot loop by condition (separate lists for alive and dead objects), or use branchless arithmetic; in million-iteration loops, replace virtual dispatch with concrete-type dispatch (patterns §3, hot-path exemption).
- Going deeper (SIMD, false sharing, prefetching, Burst/Jobs) → hand off to the **unity-performance** skill. This standard requires only that §1–§3 are clean before you reach this notch — 90% of "slow algorithms" die from the wrong container and allocation inside a loop, not from a lack of SIMD.

## §5 Container cost quick reference per language (hot-path landmines)

| Language | Cheap | Expensive (use with care or not at all on hot paths) |
|------|------|---------------------|
| C# | Arrays, pre-allocated `List<T>`, `Span<T>`, struct enumerators | LINQ chains, `foreach` over an interface-typed collection (enumerator boxing), building a temporary `Dictionary`, string concatenation |
| Go | Pre-allocated slices, arrays, iteration by value | Frequent `map` insert/delete (no shrink), `append` without cap, interface boxing that escapes, `fmt.Sprintf` |
| C++ | `vector` with reserve, `array`, `string_view`, `span` | `std::map` / `list` (scattered nodes), `unordered_map` with the default hash on hot paths, `shared_ptr` copies (atomic refcount), temporary `std::string` |
| Java | Primitive arrays, pre-allocated `ArrayList` | Autoboxing collections (`List<Integer>`), Stream chains, `HashMap` resizing frequently, string `+` in a loop |
| Lua | Reused tables, contiguous indices in the array part, `table.concat` | Creating tables/closures within a frame, string `..` in a loop, `pairs` over an array (use `ipairs` or a numeric for), `table.insert(t,1,v)` |
