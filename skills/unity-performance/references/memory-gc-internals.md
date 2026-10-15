# Extreme optimization at the memory layer: GC internals, struct layout, cache friendliness

On modern CPUs, **time spent waiting on memory vastly exceeds time spent on arithmetic**: an L1 hit is ~4 cycles, a main-memory miss ~200+. Extreme optimization of memory-bound code is essentially "laying the data out the way the CPU likes it."

## 1. Cost model (establish the right intuition first)

| Operation | Order of magnitude | Implication |
|------|------|------|
| Allocating a small object (GC fast path) | ~10 ns, a pointer bump | Allocation itself isn't expensive; **the cost is the collection afterwards and heap fragmentation** |
| Gen0 collection | Proportional to the **number of surviving objects** | Objects allocated in bulk that die immediately are relatively cheap; the poison is objects that survive a round and get promoted |
| Gen2 / full GC | Millisecond-scale pauses | Middle-aged objects (caches and event closures that live a few seconds) hurt most: promoted and then dying, over and over |
| Reference type object header | 16 B minimum on 64-bit (header + method table pointer) | `class Point{float x,y;}` is really 24 B+, and an array of them costs a dereference per element |
| L1 / L2 / main memory access | 4 / 12 / 200+ cycles | Sequential access (prefetcher-friendly) is an order of magnitude faster than random jumping |

Heap regions specific to .NET (applicable to servers and toolchains):

- **LOH (Large Object Heap)**: arrays ≥85 KB go straight to the LOH, which isn't compacted and is only collected in Gen2 → repeatedly `new`ing large arrays inevitably fragments it. Fix: rent from ArrayPool, or allocate once and reuse.
- **POH (Pinned Object Heap, .NET 5+)**: for buffers that need long-term pinning use `GC.AllocateArray<T>(pinned: true)`, so you don't pin ordinary heap objects and block compaction.
- **Unity (Boehm GC)**: no generations, no compaction, and once the heap grows it almost never returns memory to the OS → controlling the **peak** matters even more. The generational intuition ("short-lived objects are cheap") does not apply in Unity, but the zero-allocation discipline works on both. Incremental GC (on by default since 2019.1) only amortizes the pause; it doesn't reduce the volume.

## 2. Controlling struct layout

```csharp
// ✗ Auto layout + unordered fields: wasted padding
struct Bad  { byte a; double b; byte c; int d; }   // 24 B (7 B after a, 3 B after c)
// ✓ Ordered by size, descending
struct Good { double b; int d; byte a; byte c; }   // 16 B — saves 33% of memory bandwidth in array scenarios

[StructLayout(LayoutKind.Sequential, Pack = 4)]     // explicit control; mandatory for network/file binary layouts
struct Packet { /* ... */ }

// Verification tools: Unsafe.SizeOf<T>() (the true managed size) / sizeof(T) (in an unsafe context)
```

Key points:

- For structs held in arrays (millions of them), every byte saved is a megabyte of bandwidth saved — layout optimization pays off most here.
- `bool` occupies 1 B but often induces padding; for large-scale data, merge them into bit flags (`byte flags`).
- **Auto layout (classes, and structs by default) may be reordered by the runtime** — anything depending on memory layout (interop, serialization, overlap) must use `LayoutKind.Sequential` or `Explicit`.
- `LayoutKind.Explicit` + `FieldOffset` can build a union (for example reinterpreting float/int bits; the more modern route is `BitConverter.SingleToInt32Bits` / `Unsafe.As`).

## 3. AoS → SoA (the core move of data-oriented design)

```csharp
// ✗ AoS (array of structs): batch-processing one attribute drags every unrelated field into cache
class Unit { public Vector3 pos; public float hp; public int state; public string name; }
List<Unit> units;                       // plus an object header and a pointer hop per element

// ✓ SoA (struct of arrays): scan only the columns you use, sequentially, with the prefetcher at full speed
struct Units {
    public Vector3[] pos;               // the position system touches only these two columns
    public float[]   hp;
    public int[]     state;
    public string[]  name;              // cold data isolated, not polluting cache
}
// Where the gain comes from: 100% cache-line utilization plus the elimination of pointer hops;
// it is also the prerequisite for SIMD (L4).
// The Unity equivalent: ECS archetype chunks / NativeArray — the same idea, engineered.
```

When it applies: **bulk, homogeneous, column-processed** data (units, particles, orders, market quotes). Don't SoA scattered business objects — the readability cost isn't worth it.

The generalization of hot/cold separation: store hot fields (touched every frame) apart from cold ones (touched occasionally). The smaller the hot struct, the more elements fit in a cache line.

## 4. False sharing — the invisible killer of multithreaded performance

When multiple threads write **different variables within the same 64-byte cache line**, the cache coherence protocol invalidates that line repeatedly across cores, and the parallel version ends up slower than the serial one:

```csharp
// ✗ Parallel counting: adjacent elements of counts share a cache line and 8 threads trample each other
long[] counts = new long[8];
Parallel.For(0, 8, i => { for (…) counts[i]++; });

// ✓ Isolate each thread onto its own cache line
[StructLayout(LayoutKind.Explicit, Size = 64)]
struct PaddedLong { [FieldOffset(0)] public long Value; }
PaddedLong[] counts = new PaddedLong[8];
// Or: accumulate in a thread-local variable and write back once at the end
// (optimal, and it eliminates the coherence traffic as a bonus)
```

Detection signal: parallel speedup far below the core count, or even negative, with no lock contention → inspect the memory layout of the shared writes.

## 5. Advanced allocation strategy (on top of the pooling in unity-performance)

- **Tiered buffer strategy**: ≤512 B uses `stackalloc`; medium uses `ArrayPool<T>.Shared` rent/return; very large and long-lived uses a one-time pre-allocation plus reuse. Write it as a single utility method so the team doesn't decide anew each time.
- **Hold structs directly in collections**: `List<StructItem>` beats `List<ClassItem>` (contiguous memory, no object headers). Note that `list[i].Field = x` won't compile (the indexer returns a copy) — use `CollectionsMarshal.AsSpan(list)[i].Field = x` (.NET 5+) or an array.
- **The "reset" trap of object reuse**: a pooled object whose reference fields aren't cleared leaves the old references pinned by the pool — a managed leak. The pool's Release path must clear reference fields explicitly.
- **String deduplication**: with masses of duplicate strings in configuration and protocol data, build a manual dedup table at load time (normalize through a `Dictionary<string,string>`) — this often saves tens of megabytes. Use `string.Intern` with care (it's process-wide and never collected).

## 6. Verification methods

- **Layout**: assert `Unsafe.SizeOf<T>()` in a unit test so a later contributor adding a field can't silently break it.
- **Cache behavior**: BenchmarkDotNet's `[HardwareCounters(CacheMisses)]` (Windows, requires administrator); on the Unity side, corroborate by scaling (if 4× the data takes more than 4× the time, you've fallen out of cache).
- **GC behavior**: `dotnet-counters` / assert zero allocation from the before-and-after delta of `GC.GetAllocatedBytesForCurrentThread()` (this can go into a unit test: run the hot function, assert the allocation delta == 0).
