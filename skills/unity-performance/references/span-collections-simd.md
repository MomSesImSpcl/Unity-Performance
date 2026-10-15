# The Span family, collection internals, SIMD, and concurrency

<!-- navigation:start -->
## Contents

- [1. The Span family: one language for zero copying](#1-the-span-family-one-language-for-zero-copying)
- [2. Collection internals and selection](#2-collection-internals-and-selection)
- [3. SIMD vectorization (L4)](#3-simd-vectorization-l4)
- [Route A: portable SIMD (first choice for .NET servers and tooling)](#route-a-portable-simd-first-choice-for-net-servers-and-tooling)
- [Route B: hardware intrinsics (x86 Sse/Avx, Arm AdvSimd)](#route-b-hardware-intrinsics-x86-sseavx-arm-advsimd)
- [Route C: Unity → Burst (the only right answer)](#route-c-unity--burst-the-only-right-answer)
- [4. The performance side of concurrency and async](#4-the-performance-side-of-concurrency-and-async)
- [5. Extreme string handling and parsing (high-frequency IO / protocol scenarios)](#5-extreme-string-handling-and-parsing-high-frequency-io--protocol-scenarios)
<!-- navigation:end -->

## 1. The Span family: one language for zero copying

```csharp
// The core idea: every API dealing with "a contiguous run of memory" takes ReadOnlySpan<T>
// or writes Span<T>. Callers can pass an array, a slice, stack memory, or pooled memory —
// zero copying and zero allocation throughout.

// Parsing (replaces the whole Substring/Split family):
ReadOnlySpan<char> line = raw;
int comma = line.IndexOf(',');
int id = int.Parse(line[..comma]);                    // Parse directly on the slice — no substring allocation

// Formatting (replaces ToString + concatenation):
Span<char> buf = stackalloc char[32];
value.TryFormat(buf, out int written);                 // number → characters, zero allocation

// string.Create: string construction with one allocation, written in place
string s = string.Create(len, state, (span, st) => { /* fill span directly */ });

// Interop with collections:
Span<int> sl = CollectionsMarshal.AsSpan(list);        // the List<T>'s backing array (.NET 5+; no add/remove meanwhile)
ref var v = ref CollectionsMarshal.GetValueRefOrNullRef(dict, key);   // update a dictionary value without a second lookup (.NET 6+)
```

Limits and workarounds: `Span<T>` is a ref struct — it can't go in a field, into an async method, or into a lambda capture. When you need to "store it," use `Memory<T>` (which can be a field; take `.Span` when using it). In Unity, Span is fully available (2021.2+); CollectionsMarshal requires a matching .NET version, and where it isn't available, fall back from List to an array.

## 2. Collection internals and selection

| Fact | Optimization |
|------|---------|
| List/Dictionary/StringBuilder growth = a new array + a full copy (doubling) | **Whenever capacity is predictable, pass it to the constructor** — the cheapest optimization there is, one line |
| A Dictionary lookup = hash + bucket chain scan; string keys hash on every lookup | Prefer int/enum keys for hot-path dictionaries; for string keys consider pre-hashing or switching to IDs |
| `dict[key]` throws when the key is absent | `TryGetValue` does one lookup; for "look up then modify," GetValueRefOrNullRef avoids the second |
| HashSet.Contains O(1) vs List.Contains O(n) | Switch membership tests to HashSet above n ≈ 16; but at very small n (≤8), a List linear scan is faster (cache-friendly, no hashing) |
| Struct enumerators: `foreach` over List/Dictionary/HashSet allocates nothing; **boxes once upcast to an interface reference** | Don't widen a collection to `IEnumerable<T>` before iterating on a hot path |
| Read-only hot lookup tables (.NET 8+) | `FrozenDictionary` / `FrozenSet`: slow to build, faster to look up than Dictionary (optimized purely for reads); build once at startup |
| High-throughput queues | A ring buffer (array + head/tail pointers) instead of `Queue<T>`; for multiple producers use `Channel<T>` |
| Sorting | `Span.Sort` / `Array.Sort` sort in place; avoid OrderBy (it allocates a whole LINQ pipeline); use a heap for top-K rather than a full sort |

## 3. SIMD vectorization (L4)

One instruction computes 4/8/16 values. **Prerequisite: the data is already laid out contiguously as SoA** (see memory-gc-internals.md), otherwise gather overhead eats the entire gain.

### Route A: portable SIMD (first choice for .NET servers and tooling)

```csharp
using System.Numerics;

// Vector<T>: width follows the hardware (AVX2 = 8×float, NEON = 4×float) — one codebase, every platform
public static float SumSimd(ReadOnlySpan<float> data)
{
    var acc = Vector<float>.Zero;
    int i = 0, w = Vector<float>.Count;
    for (; i <= data.Length - w; i += w)
        acc += new Vector<float>(data.Slice(i, w));
    float sum = Vector.Dot(acc, Vector<float>.One);    // horizontal sum
    for (; i < data.Length; i++) sum += data[i];        // scalar tail
    return sum;
}
// .NET 7+ gives finer control: the cross-platform Vector128/256/512<T> APIs
// (Shuffle, Blend, and friends all have portable versions)
```

Check the BCL first: `Span.IndexOf` / `SequenceEqual` / `Fill`, and `TensorPrimitives` (.NET 8+, with dot products, distances, and activation functions all vectorized) — don't hand-write what the BCL already vectorized.

### Route B: hardware intrinsics (x86 Sse/Avx, Arm AdvSimd)

Only for extreme cases (specific shuffles, saturating arithmetic); you write one version per architecture plus a scalar fallback, which is expensive to maintain. Dispatch on `Vector128.IsHardwareAccelerated`. **Not available under IL2CPP/Mono.**

### Route C: Unity → Burst (the only right answer)

Hand-written `Vector<T>` in Unity managed code essentially never vectorizes. Move numeric heavy lifting into a `[BurstCompile]` Job with `Unity.Mathematics` (float4 / math.xxx), and Burst vectorizes automatically with per-platform SIMD (including NEON). Writing tips: keep the inner loop branch-free or use `math.select`, keep data contiguous in a NativeArray, and keep iterations independent so they can be parallelized — then check the Burst Inspector to confirm vector instructions were emitted.

## 4. The performance side of concurrency and async

```csharp
// Lock-free counting / accumulation:
Interlocked.Increment(ref count);                      // faster than lock, but cache-line ping-pong is still costly under contention
// → Better: accumulate per thread locally and merge at the end
//   (eliminates the shared write entirely; for false sharing see memory-gc-internals.md)

// Fine-grained spinning: lock (Monitor) is already good (it spins then escalates);
// use SpinLock only for extremely short critical sections and only when measurement proves it wins.
// Read-heavy: ReaderWriterLockSlim often loses to lock — measure first;
// an immutable snapshot (replacing a volatile reference wholesale) is frequently the faster answer.

// The correct form of a parallel loop:
Parallel.For(0, n, () => 0L,                            // thread-local state
    (i, _, local) => local + Work(i),
    local => Interlocked.Add(ref total, local));        // synchronize once, at the end
// Task granularity: if a unit takes <1 μs, chunk manually (Partitioner.Create),
// otherwise scheduling overhead dominates.

// Async on hot paths:
// ValueTask: use ValueTask<T> for high-frequency interfaces that usually complete synchronously,
//            avoiding the Task allocation (await it exactly once).
// The limit: pooling with IValueTaskSource (see Kestrel); in Unity just use UniTask/Awaitable
//            (they've already done this layer).
// A Span inside an async method won't compile: hoist the synchronous core into a non-async
// method that takes the Span, and leave only IO in the async shell.
```

Thread-count discipline: parallelism for CPU-bound work equals the physical core count (beyond that you're only buying context switches); outside Unity's main loop, use the Job System rather than starting your own threads (which fight the engine's worker threads).

## 5. Extreme string handling and parsing (high-frequency IO / protocol scenarios)

- Use `ReadOnlySpan<char>` / `Utf8Parser` end to end (parsing bytes directly, avoiding an Encoding round trip); on .NET 8+ you can use `ISpanParsable<T>`.
- On the output side: write directly into a buffer with `IBufferWriter<byte>` + `Utf8Formatter`. Interpolated strings have a handler optimization in .NET 6+, but hot paths should still prefer TryFormat into a pooled buffer.
- Always compare with `StringComparison.Ordinal` (the default culture-sensitive comparison is an order of magnitude slower); `OrdinalIgnoreCase` beats lowercasing then comparing (which allocates).
- For masses of small strings, consider an interning table or converting `string` to an `int` ID (hash once, compare ints everywhere).
