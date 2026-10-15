# Choosing frontier zero-allocation libraries (2025–2026 ecosystem)

## Library adoption discipline (read this first)

1. **Official before third-party**: if UnityEngine.Pool / Awaitable / Unity.Collections covers it, don't add a library.
2. **AOT/IL2CPP compatibility is a hard gate**: exclude outright any library that depends on runtime Emit. A source-generator approach (compile-time generation) is the marker of AOT friendliness.
3. **Hot-path libraries must be source-controllable** (readable, modifiable, version-lockable); SDK-grade black boxes don't go on hot paths.
4. Before adopting, run a **minimal benchmark** to verify the claimed zero allocation actually holds on your Unity version + IL2CPP (for method see unity-performance's references/benchmarking.md).

## Selection table (mostly the Cysharp family — all MIT, source-generator-based, Unity-supported)

| Library | Replaces | How it reaches zero allocation | Key constraints | When it fits |
|----|--------|-----------|---------|---------|
| **UniTask** | Coroutines / Task | Custom PlayerLoop driver + struct-based awaiter + IValueTaskSource pooling; 0 B end to end | async method signatures change to UniTask; cancellation requires CancellationToken discipline | Standard for async-heavy projects; before Unity 6, the only complete solution |
| **Awaitable** (official, Unity 6 / 2023.1+) | Coroutines | Officially pooled awaitable + background-thread switching APIs | Narrower feature surface than UniTask (no rich WhenAll-style operators) | New projects, or when you want zero dependencies; complex async orchestration still picks UniTask |
| **ZString** | string.Format / StringBuilder / interpolation | Struct builder writing into a pooled UTF-16/UTF-8 buffer, with TryFormat writing directly | The final `.ToString()` still produces one string — full zero requires ending at a TMP.SetText overload | Projects with lots of composed text (chat, descriptions, rich text) |
| **ZLinq** (2025) | System.Linq | Struct chained enumerators (ValueEnumerable); 0 B no matter how long the chain; includes LINQ to Span/SIMD/Tree | Some `foreach` semantics differ on reference-type chains — follow the docs; drop-in support relies on a source generator | When the team can't give up LINQ's expressiveness but the hot path still has to pass — more realistic than "the whole team quits LINQ" |
| **MemoryPack** | JSON / protobuf-net / BinaryFormatter | Zero encoding: the memory layout *is* the wire format, so serialization ≈ memcpy; an incremental source generator emits the readers and writers | Version tolerance rules must be designed per the docs (adding/removing fields); weaker than protobuf for cross-language use | Binary save data / networking / config tables; the payoff is largest when both ends are C# (client + C# server) |
| **LitMotion** | DOTween / hand-written tweens | Data side in NativeArray + Job System + Burst; scheduling allocates nothing managed | API style differs from DOTween, so migration has a cost; callbacks still must follow the §3 delegate discipline | UI and cinematics-heavy projects where DOTween allocation already shows in the Profiler top list |
| **R3** | UniRx / event streams | The successor to UniRx: a rewritten Observable that greatly reduces allocation and timing bugs | The reactive paradigm itself has a learning cost; on hot paths still prefer the bare patterns in patterns §3 | The upgrade path for projects already on UniRx; new projects adopt as needed |
| **Unity.Collections** | List/Dictionary (at the Job boundary) | NativeArray / NativeList / NativeHashMap in unmanaged memory, invisible to the GC | Manual Dispose; managed objects can't go inside | Anywhere data enters Job/Burst (unity-performance) |
| **System.Buffers** (built in) | `new byte[]` | ArrayPool rent/return | Forgetting to return degrades the pool; the returned length is ≥ requested, so slice it | All temporary byte/char buffers |

## Recommended combinations (by project profile)

- **Ordinary mobile game (L2 target)**: UniTask + ZString + UnityEngine.Pool + ArrayPool — these four cover 90% of allocation sources. Hand-converting hot-path LINQ into for loops is enough; you don't need ZLinq.
- **Logic-heavy / lockstep (localized L3)**: the four above + MemoryPack (frame command and snapshot serialization) + an SoA / NativeCollections skeleton (patterns §6); no third-party black boxes at all inside the logic frame.
- **UI / cinematics-heavy**: add LitMotion to replace DOTween; run text through the ZString → TMP.SetText path.
- **Existing UniRx codebase**: while migrating to R3, take the opportunity to convert high-frequency streams to the bare events in patterns §3 — reactive sugar doesn't belong on hot paths.

## Versions and maintenance status (mid-2026)

The Cysharp suite (UniTask / ZString / ZLinq / MemoryPack / R3) is actively maintained, supports both Unity and .NET, and installs via UPM/NuGet. MemoryPack needs a reasonably recent Unity (its source generator requires it; 2022.3 or newer is advisable). When adopting any of these, defer to the current requirements in the official README — this table is a selection map, not a version lock.
