# Zero-allocation architecture pattern library (structural replacement, cures rebound)

Fixing allocations point by point rebounds as new code arrives. Solidify the high-frequency shapes into the **project-wide uniform patterns** below, and new code naturally grows on a zero-allocation track.

## §1 The pool family: one entry point + leak protection

Only one pool API is permitted project-wide (a hand-built static facade wrapping the various pools); scattered `new` is banned:

```csharp
public static class Pools
{
    // GameObject pools: UnityEngine.Pool.ObjectPool<T>, batch-warmed with InstantiateAsync during loading
    // Collection pools: ListPool<T> / DictionaryPool<K,V> / HashSetPool<T> (official, returned via using)
    // Byte pools: ArrayPool<byte>.Shared (network / IO)
    // Custom struct pools: ring buffer (fixed capacity, overwrite, no return needed — suits frame-scoped temporaries)
}
```

Hard rules (every one of these was learned the hard way):

- **Always set a cap**: `maxSize` prevents a peak from inflating the pool into a resident-memory bomb; past the cap, destroy rather than pool.
- **Clear references on return**: null out the object's reference fields in the Release callback, or the pool pins the old object graph — a managed leak (it shows up in Memory Profiler as "the pool holds everything").
- **Leak counting**: in Debug builds track the Get/Release delta and assert it's zero on scene change — unreturned pool objects are the hardest kind of slow leak to find.
- **Warm up during loading**: a `new` triggered by the first runtime Get breaks the 0 B commitment; fill the pool to the estimated peak on the loading screen.

## §2 The three-tier buffer strategy (the uniform answer for temporary memory)

Split three ways by size and lifetime, written as a project-wide helper, so bare `new T[]` never appears in code again:

| Tier | Mechanism | Applies to | Watch out |
|----|------|------|------|
| 1 | `stackalloc` (Span) | ≤512 B, consumed within the current stack frame | Don't repeatedly stackalloc large amounts inside a loop; async methods can't use it → hoist the synchronous core out |
| 2 | `ArrayPool<T>.Shared` rent/return, or a collection pool | KB–MB scale, spanning a few frames | The rented array's length is ≥ what you asked for — slice it to the real length with Span; `finally` must return it |
| 3 | Pre-allocated resident + reuse | Large and long-lived (frame buffers, path points, mesh data) | Pair with a double buffer to prevent read/write tearing (see §6) |

```csharp
// Template: public APIs always take a Span; internally pick storage by tier
public static int ParsePacket(ReadOnlySpan<byte> data, ref PacketBuffer outBuf) { … }
```

## §3 Allocation-free events and callbacks

C# `event` / `Action` multicast allocates a new delegate array on every `+=` / `-=`, and lambda capture adds a closure on top — event-dense game code is a major allocator. Pick a replacement pattern per situation:

```csharp
// A. Interface callback + pre-allocated list (most general):
public interface IDamageListener { void OnDamage(in DamageEvent e); }
// Subscribers implement the interface; the bus holds a List<IDamageListener> (pooled);
// struct events pass by `in` for zero copying.
// Broadcast: a for loop calling the interface directly — no delegates, no boxing;
// unsubscribe by iterating in reverse or deferring removal.

// B. Struct messages + a generic static channel (the type is the route, so even the lookup disappears):
public static class Channel<T> where T : struct {
    static readonly List<IChannelListener<T>> listeners = new(64);
    public static void Publish(in T msg) { for (int i = 0; i < listeners.Count; i++) listeners[i].On(in msg); }
}

// C. When a delegate is unavoidable: cache it in a field — allocated once, reused for life.
//    Turn capture needs into explicit (target, state) parameters — a static lambda plus
//    a generic state avoids the closure:
RunDeferred(static (self, dmg) => self.Apply(dmg), this, damage);

// D. Lockstep / heavy systems: a ring command queue — struct commands written into a ring buffer,
//    dispatched by a switch on the consuming side; zero objects along the whole chain,
//    and naturally recordable for replay (a lockstep necessity).
```

## §4 The string system (the single largest source of GC)

Solve it in layers, with the goal that **no new string is produced at runtime**:

1. **Invariant text**: pre-generate all of it (instantiated once at load time from config and localization tables).
2. **Numeric text**: build a cache table at startup, e.g. `string[] numberCache = ["0".."9999"]` (damage, gold, countdowns look it up directly); values outside that range go through TMP's built-in formatting `SetText("{0}", n)` or `char[]` + `SetCharArray`.
3. **Composed text** (name + level, and so on): a template plus ZString writing into a pooled buffer, with a dirty check on the UI side (an unchanged value doesn't rebuild).
4. **Logging**: hot-path logs must be stripped at compile time in Release (`[Conditional("DEBUG")]`); otherwise string interpolation allocates in Release anyway — `if (log) Log($"{x}")` is not enough, because the interpolation runs before the check.
5. **String comparison and keys**: hot-path string keys are always converted to IDs (hashed or table-mapped to int at startup); runtime string matching on protocol field names is banned.

## §5 Serialization and network packets (an all-Span pipeline)

- **Receiving**: read directly from `ReadOnlySpan<byte>` slices (the `BinaryPrimitives.ReadInt32LittleEndian` family), and map structured data straight onto structs with `MemoryMarshal.Cast/Read` — **zero copy, zero parse**. **Sending**: write directly into `IBufferWriter<byte>` or a pooled buffer.
- Don't want to hand-write the reader/writer → MemoryPack (zero encoding, see libraries.md). **JSON and reflection-based serialization are banned on hot paths** (every parse is an allocation storm). Config tables use a binary format decoded once at load into struct arrays.
- Packet-reassembly buffers and resend queues are all ring buffers; `byte[]` exists only inside pools.

## §6 Frame data structures (the skeleton for L3)

- **Double buffer**: read last frame's results while writing this frame's, then swap references — zero copy, zero allocation. This eliminates the temporary collections spawned by "modifying while iterating."
- **SoA struct arrays + generation IDs**: replace object references to entities with `(index, generation)` — this avoids lifetime entanglement (a dangling reference becomes an invalid ID) and keeps data contiguous so it can go into Job/Burst (the same source as the L2 layout gains in unity-performance's runtime ladder).
- **NativeArray/NativeList reuse**: data at the Job boundary is allocated once as Persistent and reused after Clear; TempJob is strictly disposed within 4 frames.
- **Async**: an async method allocates its state-machine box only when it genuinely suspends (awaiting an incomplete task) — a synchronously completing path with `ValueTask`/UniTask allocates nothing. The rule: hot-path async must complete synchronously most of the time; otherwise switch to polling or callbacks.

## §7 Mopping up: spikes that remain after your own code is clean

- **Third-party SDK allocation**: once the Profiler pins it down, isolate it — reduce call frequency, cache results, move it to load time. Make "zero allocation on hot paths" an SDK admission criterion during selection.
- **Deliberate GC windows**: once allocation is pushed very low, call `GC.Collect()` deliberately on loading screens, results screens, and pauses to settle the account. For L3 scenarios set `GarbageCollector.GCMode = Disabled` entering combat and restore + collect on exit, with memory water-level monitoring as the fuse (exceeding the level force-restores GC).
- **Acceptance**: over an N-minute soak the `GC.CollectionCount(0)` delta is 0 (or occurs only in the expected windows); the memory curve stays flat with no upward drift.
