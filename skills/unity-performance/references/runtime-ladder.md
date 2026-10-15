## The C# extreme-optimization ladder and runtime guardrails

The ladder only answers "which layer to squeeze first." What you use at each layer is up to you; frontier techniques are fair game as long as they clear the evidence and order-of-magnitude checks.

| Layer | Direction | Typical gain | Fallback reference |
|----|------|---------|------|
| L0 Algorithms | Complexity, precomputation, result caching, incremental updates | 10–1000× | [baseline-antipatterns.md](baseline-antipatterns.md) group A |
| L1 Allocation | Zero GC: pooling, Span, stackalloc, struct | Eliminates GC spikes, 2–10× | See csharp-zero-gc for the engineering plan |
| L2 Layout | Cache friendliness: SoA, struct field ordering, sequential access, false-sharing elimination | 2–20× | [memory-gc-internals.md](memory-gc-internals.md) |
| L3 Compiler | Inlining, devirtualization, bounds-check elimination, branch elimination, IL2CPP check stripping | 1.2–3× | [jit-il2cpp-tricks.md](jit-il2cpp-tricks.md) |
| L4 Vectorization | SIMD (Burst and Unity.Mathematics preferred), parallelism | 4–16× | [span-collections-simd.md](span-collections-simd.md) |
| L5 unsafe | Pointers, fixed buffers, bypassing safety checks | 1.1–2× | Final chapter of jit-il2cpp-tricks.md |

**Work the layers in order.** Reaching for L4 while L2 is undone (data jumping randomly through memory) is wasted — the CPU is waiting on memory and the vector units idle. Caching and skip-style optimizations need two levels of follow-up: after skipping unchanged frames, can the changed frames themselves be diffed (apply only the delta instead of replaying everything)? And the "no external interference" assumption a cache rests on must either be proven by auditing the full call surface or given an explicit invalidation API as an escape hatch — one of the two is mandatory. For benchmarking method, see [references/benchmarking.md](benchmarking.md).

Runtime guardrails must be confirmed before you start, and not merely down to "IL2CPP or Mono" — confirm down to how the target assembly actually executes: is it in the hot-update assembly list of a hot-update framework (HybridCLR, ILRuntime, xLua) — check the framework's settings asset and the asmdef GUIDs; is it constrained by an AOT generic pre-generation manifest (when a hot-update framework's AOT metadata supplement list is empty, introducing a new value-type generic instantiation crashes on device — even "use an enum as a dictionary key" is out); does the asmdef have `allowUnsafeCode` enabled? Within one build, AOT-compiled assemblies and interpreted assemblies can differ by an order of magnitude in the unit cost of loop iteration and allocation. Miss this layer and every multiplier that follows is wrong.

| Technique | .NET 8+ | Unity IL2CPP | Unity Mono | Hot-update interpreter |
|------|:---:|:---:|:---:|:---:|
| Span / stackalloc / ArrayPool | ✅ | ✅ | ✅ | Constrained by `allowUnsafeCode` |
| AggressiveInlining / sealed devirtualization | ✅ | ✅ | ⚠️ weak | ❌ no inlining |
| SIMD: hardware intrinsics | ✅ | ❌ | ❌ | ❌ |
| The Unity answer for SIMD: Burst + Unity.Mathematics | — | ✅ | ✅ | — |
| Function pointers `delegate*` | ✅ | ✅ (2021.2+) | ✅ | ⚠️ measure it |
| Dynamic codegen (Emit / expression trees) | ✅ | ❌ forbidden under AOT | ✅ | ❌ |
| New value-type generic instantiation | ✅ | ⚠️ needs AOT manifest | ✅ | ❌ crashes without supplemental metadata |

**Guardrails prevent wrecks; they don't set a ceiling.** The matrix reflects runtime reality as of writing. If you know a newer version has lifted one of these limits, go with your knowledge and cite the version.
