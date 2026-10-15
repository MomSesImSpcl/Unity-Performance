# Compiler-layer techniques: JIT / IL2CPP behavior and how to steer it (including unsafe as a last resort)

<!-- navigation:start -->
## Contents

- [1. Inlining](#1-inlining)
- [2. Devirtualization](#2-devirtualization)
- [3. Bounds check elimination](#3-bounds-check-elimination)
- [IL2CPP only: explicit stripping with Il2CppSetOption (Unity's extreme move)](#il2cpp-only-explicit-stripping-with-il2cppsetoption-unitys-extreme-move)
- [4. Branch optimization](#4-branch-optimization)
- [5. Function pointers and other C# 9+ tools](#5-function-pointers-and-other-c-9-tools)
- [6. unsafe: the last resort (L5)](#6-unsafe-the-last-resort-l5)
- [7. AOT environment prohibitions (IL2CPP / NativeAOT)](#7-aot-environment-prohibitions-il2cpp--nativeaot)
<!-- navigation:end -->

Goal: get the compiler to emit optimal machine code for your hotspots. Each technique notes which runtimes it applies to (.NET JIT / Unity IL2CPP / Unity Mono).

## 1. Inlining

The cost of calling a small function isn't the `call` itself — it's that the call **blocks cross-function optimization** (register allocation, bounds check elimination, and constant propagation all stop at the function boundary).

```csharp
using System.Runtime.CompilerServices;

[MethodImpl(MethodImplOptions.AggressiveInlining)]   // a hint, not a command; the JIT still refuses when the body is too large or too branchy (dotnet/runtime#41692)
public static float Sq(float x) => x * x;

[MethodImpl(MethodImplOptions.NoInlining)]           // the reverse: forbid inlining large cold functions so they don't bloat hot ones
static void ThrowHelper() => throw new InvalidOperationException();
```

- Applicability: .NET ✅ / IL2CPP ✅ (translated to a C++ inline hint, usually more aggressive) / Mono ⚠️ weak.
- **Hoisting the throw path out is the standard move**: write `if (bad) ThrowHelper();` inside the hot function. The JIT almost never inlines a method containing a `throw` (the expanded code is large and inflates the caller), so moving it into a separate cold function lets the hot function inline again (this is the ThrowHelper pattern used throughout the BCL).
- Verification: use BenchmarkDotNet's DisassemblyDiagnoser to see whether the `call` disappeared.

## 2. Devirtualization

Virtual and interface calls can't be inlined and add an indirect jump:

```csharp
// Techniques in order of strength:
// 1. sealed: write classes sealed by default (both the JIT and IL2CPP can turn a virtual call into a direct one)
public sealed class FastPath : IHandler { … }

// 2. Generics + a constraint instead of an interface parameter — a value-type argument
//    generates specialized code and the interface call disappears entirely:
static int Sum<T>(ReadOnlySpan<int> data, T op) where T : struct, IOp
    => … op.Apply(…) …;   // when T is a struct: zero virtual calls, inlinable, no boxing
// This is the core pattern of the BCL and high-performance libraries (the "strategy struct");
// .NET ✅ / IL2CPP ✅ (AOT specialization)

// 3. Do the type test once outside the hot loop and take a concrete-type branch inside it
//    (manual devirtualization):
if (handler is FastPath fp) { for (…) fp.Handle(x); }
else                        { for (…) handler.Handle(x); }
```

## 3. Bounds check elimination

Every index into a managed array implies `if (i >= arr.Length) throw`. The JIT can eliminate it in shapes it can **prove safe**:

```csharp
// ✓ Eliminable: a forward for over 0..Length that doesn't reassign arr inside the loop
for (int i = 0; i < arr.Length; i++) sum += arr[i];

// ✗ Not eliminable (checked on every access):
for (int i = 0; i < count; i++) sum += arr[i];        // the JIT can't prove the relation between count and arr.Length
for (int i = arr.Length - 1; i >= 0; i--) …           // reverse (newer JITs handle some cases — don't bet on it)
sum += arr[i] + arr[i + 1];                            // compound indexing

// Fix: slice a Span first to fix the range, then iterate in the standard shape
var s = arr.AsSpan(0, count);
for (int i = 0; i < s.Length; i++) sum += s[i];
```

- The .NET JIT ✅ recognizes these shapes; IL2CPP ⚠️ generates its own checks, and relying on shape-based elimination is unreliable there → use the explicit stripping below.

### IL2CPP only: explicit stripping with Il2CppSetOption (Unity's extreme move)

```csharp
using Unity.IL2CPP.CompilerServices;   // requires copying Il2CppSetOptionAttribute.cs from the IL2CPP install directory into the project (the officially documented approach)

[Il2CppSetOption(Option.NullChecks, false)]          // strip automatic null checks
[Il2CppSetOption(Option.ArrayBoundsChecks, false)]   // strip array bounds checks
[Il2CppSetOption(Option.DivideByZeroChecks, false)]
public static class HotMath
{
    // Only put hot functions here whose indices and references are already proven safe externally
}
```

**Discipline**: apply it only to narrow hotspots (method or class level, never globally); every index and reference inside a stripped method must be guaranteed externally, because going out of bounds now corrupts memory instead of throwing. For numeric heavy lifting, prefer Burst (which brings its own aggressive optimization); Il2CppSetOption is for managed hot paths Burst can't reach.

## 4. Branch optimization

```csharp
// 1. Branchless — worth doing only for hot branches that are random and unpredictable:
int max = a > b ? a : b;                       // the JIT usually already emits cmov; read the assembly before acting
uint mask = (uint)((x - threshold) >> 31);     // manual bit tricks: only when you've proven cmov wasn't emitted
// Use the BCL versions of Math.Min/Max/Clamp (already optimal and vectorizable)

// 2. Make branches predictable (more often useful than eliminating them): pre-sort or bucket
//    the data so similar elements are processed consecutively, pushing the branch predictor's
//    hit rate toward 99% — often faster than branchless, and more readable.

// 3. Hot/cold separation: extract the heavy code of exception, logging, and rare branches into
//    NoInlining cold functions. Smaller hot-path code means better icache hit rates and easier inlining.
```

## 5. Function pointers and other C# 9+ tools

```csharp
// delegate*: no object header, no closure, a call is just a call — the ultimate form for hot callback tables
unsafe delegate*<int, int, int> op = &Add;      // only static methods can be taken
int r = op(1, 2);                                // ≈ a direct call; .NET ✅ / IL2CPP ✅ (Unity 2021.2+, with limited support for unmanaged calling conventions)
static int Add(int a, int b) => a + b;

// [SkipLocalsInit]: skips zeroing a large stackalloc (initlocals memsets it by default)
// Available only on .NET 5+ (System.Runtime.CompilerServices); Unity managed code has no such attribute,
// and inside Burst code you use the equivalent Unity.Burst.CompilerServices.SkipLocalsInitAttribute
[SkipLocalsInit]
static void Parse() { Span<byte> buf = stackalloc byte[4096]; /* never read before being fully overwritten */ }

// ref returns / ref locals: access large structs through without copying
ref var slot = ref grid[Index(x, y)];  slot.hp -= dmg;   // no 24 B+ copy in and out
// readonly struct + in parameters: eliminates defensive copies
// (note that `in` on a non-readonly struct is actually slower)
```

## 6. unsafe: the last resort (L5)

Entry conditions: L2–L4 are done and you're still short of the last stretch, and the function has complete test coverage.

```csharp
// Legitimate use 1: reinterpreting bulk data (network packet → struct array), zero copy:
ReadOnlySpan<Quote> quotes = MemoryMarshal.Cast<byte, Quote>(packetBytes);

// Legitimate use 2: a pointer scan that bypasses repeated bounds checks:
unsafe {
    fixed (float* p = data) {
        float* end = p + data.Length;
        for (float* cur = p; cur < end; cur++) sum += *cur;
    }
}

// Toolbox: Unsafe.As / Unsafe.Add / MemoryMarshal.GetReference / GetArrayDataReference
// Fixed buffers (a fixed-length array embedded in a struct): public unsafe fixed byte Name[32];
// — for interop and network packet layout
```

**Discipline**: unsafe code must — (1) be wrapped in the smallest possible function that exposes a safe signature outward (taking a Span, not a pointer); (2) document its safety preconditions in a comment; (3) keep a safe reference implementation alongside it (with a unit test cross-checking that both produce the same result); (4) only be reached for after you've confirmed the safe Span/MemoryMarshal APIs can't do it (in 90% of cases the safe API is already the same speed).

## 7. AOT environment prohibitions (IL2CPP / NativeAOT)

- ❌ `Reflection.Emit`, expression tree `.Compile()`, and new generic instantiations created at runtime → an outright crash or a fall back to the interpreter. The alternative: a **source generator** (compile-time generation, the modern standard answer for serializers and mappers).
- Reflection itself works but is slow and obstructs stripping: replace hot-path reflective access with a source generator, or cache a `delegate*` / Delegate at startup.
- Generics plus value types expand code size combinatorially under AOT: use them for the extremely hot paths, but sprinkling them everywhere slows compilation and grows the build.
