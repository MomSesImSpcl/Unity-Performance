# C# code-level optimization: zero GC on hot paths

<!-- navigation:start -->
## Contents

- [1. Complete inventory of GC allocation sources (identify them one by one)](#1-complete-inventory-of-gc-allocation-sources-identify-them-one-by-one)
- [1. Boxing](#1-boxing)
- [2. Closures and delegates](#2-closures-and-delegates)
- [3. LINQ and iterators](#3-linq-and-iterators)
- [4. Strings](#4-strings)
- [5. Hidden allocations in Unity APIs](#5-hidden-allocations-in-unity-apis)
- [6. Object lifecycle: pooling](#6-object-lifecycle-pooling)
- [7. Coroutines and async](#7-coroutines-and-async)
- [2. Structure and data layout](#2-structure-and-data-layout)
- [3. Update architecture](#3-update-architecture)
- [4. The GC strategy itself](#4-the-gc-strategy-itself)
- [5. IL2CPP and compile time](#5-il2cpp-and-compile-time)
<!-- navigation:end -->

Hot path, defined: code that runs every frame or at high frequency — Update/LateUpdate/FixedUpdate, coroutine loop bodies, UI refresh, network send/receive, and object spawn/destroy peaks. **The target in these places is GC Alloc = 0 B/frame.** Non-hot paths (initialization, low-frequency callbacks) needn't be held to this standard; readability comes first there.

## 1. Complete inventory of GC allocation sources (identify them one by one)

### 1. Boxing

Happens when a value type converts to object or an interface reference — the most insidious allocation source:

```csharp
// ✗ Common ways to box
object o = 42;                          // explicit
string s = "hp:" + 10;                  // int boxed, then ToString
Debug.Log(someInt);                     // the parameter is object
enumDict[MyEnum.A] = 1;                 // on old Mono runtimes the default comparer for enum keys boxes
// a struct instance calling a non-overridden Equals/GetHashCode → boxes through the object base class
IEnumerable ie = someList;              // List<T> converted to a non-generic interface

// ✓ Fixes
// Generic APIs / concrete types; use a cache or StringBuilder for strings;
// Enum dictionary keys: on modern .NET 4.x / IL2CPP runtimes EqualityComparer<TEnum>.Default
// no longer boxes, but on legacy projects supply a custom IEqualityComparer<TEnum>
// (comparing via an int cast).
```

### 2. Closures and delegates

```csharp
// ✗ A lambda capturing a local → allocates a closure class + a delegate on every call
button.onClick.AddListener(() => Attack(target));   // new every time
list.Sort((a, b) => a.cost - b.cost);               // called per frame means allocated per frame

// ✓ Fixes
static readonly Comparison<Item> s_ByCost = (a, b) => a.cost - b.cost; // no capture → cached once
// When you need to carry data: a reusable class implementing IComparer<T>, with the data in fields
// Keep subscribe/unsubscribe off hot paths; C# 9+ static lambdas make the compiler reject accidental capture
```

### 3. LINQ and iterators

LINQ is **banned** on hot paths (`Where/Select/Any/First/ToList` all allocate enumerators, delegates, or result containers), and a `yield return` method allocates a state machine on every call. Use for loops plus a reused List.

`foreach` itself allocates nothing over concrete types like List, arrays, and Dictionary (struct enumerators); but over an **interface reference** such as `IEnumerable<T>` / `IList<T>` it boxes the enumerator — so hot-path parameters should take concrete types wherever possible.

### 4. Strings

```csharp
// ✗ Per frame: text.text = "Gold: " + gold;  or $"Gold: {gold}"
// ✓ Fixes (pick by situation):
if (gold != _lastGold) { _lastGold = gold; _sb.Clear(); _sb.Append("Gold: ").Append(gold); label.SetText(_sb); }
// TMP-specific zero allocation: label.SetText("Gold: {0}", gold);  // TMP's built-in formatting produces no string
// For heavy concatenation, adopt the ZString library (Cysharp — an allocation-free StringBuilder)
// Compare with string.Equals(a, b, StringComparison.Ordinal) to avoid culture-sensitive comparison cost
```

### 5. Hidden allocations in Unity APIs

| API | Problem | Replacement |
|-----|------|------|
| `Physics.RaycastAll` / `OverlapSphere` | Returns a new array each call | `RaycastNonAlloc` / `OverlapSphereNonAlloc` + a pre-allocated buffer |
| `GetComponents<T>()` | Returns a new array | The `GetComponents(List<T>)` overload that reuses a list |
| `Mesh.vertices` / `triangles` | Copies the whole array on every access | `GetVertices(List<Vector3>)` / the Advanced Mesh API |
| `gameObject.tag` / `name` | Allocates a string on every access | `CompareTag()`; cache the name |
| `Input.touches` | Allocates an array | `Input.GetTouch(i)` + `touchCount`, or the new Input System |
| `Animator.SetFloat("Speed", v)` | Hashes the string every call | `static readonly int SpeedId = Animator.StringToHash("Speed")` |
| `material.SetColor("_Color", c)` | Same as above + material instantiation | `Shader.PropertyToID` + MaterialPropertyBlock |
| `Camera.main` | Internally cached since 2020.2, but still has lookup semantics | Cache the reference at initialization (safe across versions) |
| Deep chained `transform` access | Each level's property call has cost | Cache the `Transform` reference on hot paths; for bulk position read/write use `Transform.GetPositionAndRotation` or the jobs TransformAccessArray |

### 6. Object lifecycle: pooling

Frequent `Instantiate`/`Destroy` (bullets, floating text, effects, list items) means allocation + Awake/OnDestroy cost + GC pressure. Use the official `UnityEngine.Pool`:

```csharp
using UnityEngine.Pool;

ObjectPool<Bullet> _pool;
void Awake() => _pool = new ObjectPool<Bullet>(
    createFunc: () => Instantiate(bulletPrefab),
    actionOnGet: b => b.gameObject.SetActive(true),
    actionOnRelease: b => b.gameObject.SetActive(false),
    actionOnDestroy: b => Destroy(b.gameObject),
    defaultCapacity: 32, maxSize: 256);

// Don't `new` temporary containers either: the framework ships static pools, and what you get you must return
using (ListPool<Enemy>.Get(out var tmp)) { /* tmp is returned automatically when done */ }
// Same family: DictionaryPool / HashSetPool / GenericPool; for byte[] and similar use System.Buffers.ArrayPool<T>.Shared
```

Pooling acceptance: warm-up (fill during loading; on 2022.3.20+ use bulk `Object.InstantiateAsync` asynchronously, see engine-rendering.md §5) + a cap (so a peak doesn't blow it up) + full coverage of the return paths (a missed return is a leak).

### 7. Coroutines and async

```csharp
// ✗ while(true){ yield return new WaitForSeconds(0.1f); }   // allocates every iteration
// ✓ Cache it: var wait = new WaitForSeconds(0.1f); while(true){ yield return wait; }
// The same goes for yield return 0 and new WaitForEndOfFrame(); yield return null allocates nothing

// Frontier options (pick one, don't mix):
// Unity 6+: Awaitable — officially pooled async/await replacing coroutines, with
//           Awaitable.NextFrameAsync() and Awaitable.BackgroundThreadAsync() to move heavy
//           work to a background thread and return to the main thread
// Unity 2021+, universal: UniTask (Cysharp) — allocation-free async/await driven by the
//           PlayerLoop, with the most mature ecosystem
// Both solve coroutines' two big pains: per-frame enumerator overhead, and the lack of
// return values and exception propagation
```

## 2. Structure and data layout

- **struct vs class**: use struct for small, short-lived data processed in groups (no GC + cache friendly); pass by value at ≤16 B, and above that use an `in` parameter plus `readonly struct` (which eliminates defensive copies). Avoid copying large mutable structs around.
- **Span<T> / stackalloc**: for small temporary buffers use `Span<byte> tmp = stackalloc byte[64]` — zero heap allocation. For slicing and parsing (network packets, strings) use `ReadOnlySpan<char>` + `slice` instead of Substring. Both IL2CPP and modern Mono support it.
- **Jagged vs multidimensional arrays**: `T[][]` or a flattened 1-D array is faster than `T[,]` (the latter goes through a slower bounds-checking path).
- **Cache locality**: for large volumes of homogeneous data, SoA (splitting a struct array into several arrays) plus sequential iteration is an order of magnitude faster than jumping randomly through an object graph — this is exactly the theoretical basis of ECS; see jobs-burst-dots.md.
- **Avoid exception-based control flow on hot paths**: try/catch itself is free, but `throw` is extremely expensive; use `TryGetValue` on a dictionary rather than catching KeyNotFound.

## 3. Update architecture

When thousands of MonoBehaviours each have their own Update, the engine→managed per-object call overhead alone eats several milliseconds (regardless of the function body). Move objects that scale (units, bullets, buffs) to the **manager pattern**:

```csharp
// One UnitSystem.Update() that for-loops over List<Unit> calling unit.Tick(dt)
// Gains: a single cross-boundary call; can be spread across frames (1/N per frame);
// can be rate-reduced by distance; and can later be ported to a Job
```

Companion measures: stop updating invisible objects (`OnBecameInvisible`, or manage visibility yourself); time-slice low-priority logic; set `Application.targetFrameRate` explicitly (mobile defaults to 30).

## 4. The GC strategy itself

- **Controlling the peak matters more than the mean** (the Tencent UPA framing): Unity's Mono/Boehm memory pool only grows and never shrinks, so **the peak is the lifetime footprint** — a single concentrated allocation spike raises the memory water level permanently. On low-end devices, "healthy mean, over-budget peak" still OOMs.
- **Allocate large before small** (UPA's official anti-fragmentation strategy): the Mono pool doesn't compact, so small fragments claiming space first shatter the pool, and later large objects can't fit and force further expansion. During loading, allocate the large blocks (object pools, big arrays, resident caches) all at once first, then let small allocations fill the gaps.
- **Incremental GC** (Player Settings; on by default in modern versions): slices a single stop-the-world pause into small steps across frames. It treats the *spikes*, not the *volume* — total allocation still has to be reduced by the means above.
- Call `GC.Collect()` deliberately where a pause is imperceptible (loading screens, results screens) to pay the debt when the user isn't sensitive to it.
- `GarbageCollector.GCMode = Disabled` is only for extreme cases like racing levels, and must be paired with zero-allocation discipline and a restore point.

## 5. IL2CPP and compile time

- Ship mobile with **IL2CPP** (AOT — faster than Mono, and the only choice on iOS); set C++ Compiler Configuration to Master.
- **Code stripping** (Managed Stripping Level = High) shrinks the build and speeds loading; pair it with `[Preserve]` / link.xml to keep types used via reflection.
- Sealed classes (`sealed`) help IL2CPP devirtualize; avoid interface and virtual calls on hot paths (they can't be inlined).
- Generic value-type arguments generate specialized code (fast) while reference types share code (slightly slower) — prefer value-type constraints for hot-path generics.
