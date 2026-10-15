# Zero-GC guardrails: keeping the gains from being eaten by everyday commits

Getting to zero is a one-time investment; the guardrails are a long-term asset. Three lines of defense, from the inside out: authoring time (Analyzer) → commit time (CI assertions) → review time (checklist).

## §1 Authoring time: tiered Roslyn Analyzer severity

- **Microsoft.Unity.Analyzers** (official, shipped with the VS / VSCode Unity plugin): the UNT rule set includes performance rules (UNT0028 for NonAlloc physics APIs, UNT0022 for SetPositionAndRotation, string tag comparison, and others). Enable it project-wide.
- **Heap allocation analyzers** (Heap Allocation Analyzer / ClrHeapAllocationAnalyzer family): squiggles under every implicit allocation right in the IDE. The HAA rule set covers closure capture, params arrays, boxing, enumerator boxing, implicit string conversion, and `new` on reference types. This is the single most important tool for making allocation *visible*.
- **Tiering strategy (EditorConfig per directory)**: in hot-path assemblies and directories (combat, core loop) set the allocation rules to **error** (it won't compile); in ordinary gameplay code set them to warning; in editor and tooling code set them to none. Zero-GC discipline is imposed only on code that committed to zero GC — otherwise universal resentment gets the rules turned off wholesale.

```ini
# Example .editorconfig for a hot-path directory (rule IDs follow the docs of the analyzer you install)
[*.cs]
dotnet_diagnostic.HAA0301.severity = error   # closure capture
dotnet_diagnostic.HAA0101.severity = error   # implicit params array
dotnet_diagnostic.HAA0601.severity = error   # value type boxing
```

## §2 Commit time: CI allocation assertions (the core regression guard)

**EditMode unit test template — an allocation assertion for pure logic functions:**

```csharp
[Test]
public void BattleTick_ZeroAlloc()
{
    var sim = BattleSimFixture.Create();
    sim.Tick(0.033f);                                   // warm-up: lazy init allocation is allowed on the first frame
    long before = GC.GetAllocatedBytesForCurrentThread();
    for (int i = 0; i < 100; i++) sim.Tick(0.033f);
    long delta = GC.GetAllocatedBytesForCurrentThread() - before;
    Assert.AreEqual(0, delta, $"BattleTick allocated {delta}B");
}
```

**PlayMode / Performance Testing assertion — whole-frame level:**

```csharp
[UnityTest, Performance]
public IEnumerator MainLoop_ZeroAlloc()
{
    yield return LoadBattleSceneAndWarmup();            // warm up several frames, fill the pools
    using (Measure.Scope("MainLoop"))
    {
        // Sample GC() from com.unity.test-framework.performance and assert the GC.Alloc SampleGroup == 0
    }
}
// Or the plain version: record GC.CollectionCount(0), run 600 frames, assert it didn't increase
```

Discipline:
- **Count after warm-up** — the one-time allocation from lazy initialization on the first frame is allowed; don't let it turn the assertion into red noise.
- **Prove the measured path ran.** A zero-allocation result only counts if the code under test actually executed inside the measured window. Otherwise a test that skips the hot path (an empty registry, a branch never taken, an early return) passes trivially. Drive the scenario so every committed branch fires (hits, kills, despawns, rare events), and assert counters or state changes for each one alongside the allocation assertion, e.g. `Assert.Greater(hitsProcessed, 0)` and `Assert.Greater(deathsProcessed, 0)`. Also add a canary: a deliberate allocation inside the same window that must make the test fail, proving the measurement itself works.
- Every system committed to L2/L3 gets **at least one allocation assertion**, and new systems ship their assertion at merge time — this is where clause 3 of the SKILL.md output specification lands.
- Assertion tests must run against an **IL2CPP CI target** at least daily (Mono and IL2CPP occasionally differ in allocation behavior, for instance on certain generic and enumerator paths).
- Threshold assertions (such as ≤64 B) are a transitional compromise only and must carry a TODO and an expiry date; otherwise the threshold creeps right back up.

## §3 Review time: PR checklist (walk every hot-path change through it)

1. Does a new `new` (object / array / collection) enter a hot path? Which buffer or pool tier does it use?
2. Does the lambda capture anything? (Require a `static` lambda or explicit state passing.)
3. Are there LINQ calls, `foreach` over an interface type, or `params` calls?
4. Strings: any concatenation, interpolation, or ToString? Does the logging have `[Conditional]`?
5. Boxing: does a value type go through object / an interface / a non-generic API? Is an enum used as a dictionary key (on older runtimes)?
6. Are all return paths for pooled objects covered? Does the exception path (try/finally) return too? Are reference fields cleared?
7. New async points: will they most often complete synchronously? Is it UniTask/Awaitable or Task?
8. Event subscription: any runtime `+=` with an anonymous method? Is unsubscription symmetric?
9. Third-party calls: is this SDK function clean in the Profiler (checking once is enough — record it)?
10. Guardrails: where is the allocation assertion or Analyzer coverage for this change?

## §4 Runtime backstop: production water-level monitoring

- **Frame allocation sampling**: in Development and beta builds, aggregate and report the delta from `ProfilerRecorder("GC.Alloc")` or `GC.GetAllocatedBytesForCurrentThread` by scene — this is how you close the loop on whether the zero-GC commitment holds on real player paths (feeding into the live-ops system in wetest-bugly-fieldops.md).
- The GC-off window (L3) must come with a **memory water-level fuse**: exceeding the level force-restores GC and reports an event — better to drop one frame than to crash on OOM.
- **Per-version comparison**: put three curves on the release health dashboard — the number of allocation assertions, the Profiler's top-20 allocation sites, and the Mono peak. Zero GC is a continuous state, not a milestone.
