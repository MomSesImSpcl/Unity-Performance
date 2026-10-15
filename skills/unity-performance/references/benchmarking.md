# Benchmarking methodology: no numbers, no optimization

Intuition about micro-optimization is wrong at an extremely high rate: tiered JIT compilation, dead code elimination, out-of-order execution, and cache warm-up all lead a hand-rolled stopwatch to completely wrong conclusions. This file specifies the only trustworthy way to measure.

## 1. On the .NET side: BenchmarkDotNet (the single standard)

```csharp
using BenchmarkDotNet.Attributes;
using BenchmarkDotNet.Running;

[MemoryDiagnoser]                 // always on: emits the Allocated column (bytes per call)
[DisassemblyDiagnoser]            // optional: emits the JIT's assembly, to verify inlining/vectorization really happened
public class ParseBench
{
    private string _input = "12345,67890,11111";

    [Benchmark(Baseline = true)]  // baseline: the old implementation being replaced
    public int Split() { var parts = _input.Split(','); int s = 0; foreach (var p in parts) s += int.Parse(p); return s; }

    [Benchmark]                   // candidate: the new implementation
    public int SpanParse()
    {
        int s = 0; ReadOnlySpan<char> rest = _input;
        while (true) {
            int c = rest.IndexOf(',');
            s += int.Parse(c < 0 ? rest : rest[..c]);
            if (c < 0) return s;
            rest = rest[(c + 1)..];
        }
    }
}
// Run in the Release configuration: BenchmarkRunner.Run<ParseBench>();
```

Discipline for reading the results:

- Read **Mean + Ratio (relative to baseline) + Allocated**; ignore single absolute values. If the error column (StdDev) exceeds the difference itself, the conclusion is invalid.
- **The return value must be consumed** (returned or passed to `Consume`), otherwise dead code elimination deletes the code under test entirely and you measure a "0.0001 ns" myth.
- Parameterize with `[Params(10, 1000, 100000)]`: many optimizations hold only within a size range (stackalloc wins on small buffers and loses on large ones, for instance).
- With DisassemblyDiagnoser installed, verify the key assumptions: did it inline (the `callq` disappears), did it vectorize (`vmovups` / `vpaddd` and friends appear), were bounds checks eliminated (no `cmp` + `jae` pairs)?

## 2. On the Unity side: the Performance Testing package + ProfilerMarker

BenchmarkDotNet can't run inside Unity; the standard substitute:

```csharp
// com.unity.test-framework.performance package
[Test, Performance]
public void PathfindBench()
{
    Measure.Method(() => Pathfinder.Find(map, a, b))
        .WarmupCount(10)          // warm-up: skip JIT and first-time cache misses
        .MeasurementCount(50)
        .IterationsPerMeasurement(100)
        .GC()                     // record GC allocation per iteration
        .Run();
}
```

- The conclusion must come from an **IL2CPP on-device Player** (the editor is Mono plus editor overhead — its numbers are directional only). In CI this doubles as a performance-regression gate (threshold assertions).
- For a quick manual check without the package dependency, wrap the old and new implementations in a `ProfilerMarker`, run each tens of thousands of times, and compare in the Profiler — less precise than the above, use it only for rough screening.
- When benchmarking Burst code, set `CompileSynchronously = true`, otherwise the first round measures the unoptimized version.

## 3. Common measurement traps

| Trap | Symptom | Avoidance |
|------|------|------|
| Measuring in the Debug configuration | Every conclusion is void (no optimization, all bounds checks on) | Release / IL2CPP Master |
| No warm-up | The first iteration includes JIT and a cold cache, unfairly blaming the new implementation | Frameworks have warm-up built in; when measuring by hand, run it empty first |
| Dead code elimination | Absurdly fast (nanosecond scale) | Consume the return value |
| Constant folding | The input is a compile-time constant and the whole thing is precomputed | Take the input from a field or parameter, not a literal |
| Measuring at a scale that doesn't match production | Wins on small data and loses on large (or vice versa) | Cover the real scale with `[Params]` |
| Concluding from a single run | Dominated by scheduler and downclocking noise | Take statistics over many runs; on a laptop, plug it in and use the high-performance power plan |
| Wins in the microbenchmark, imperceptible in the real scene | That function isn't on the hot path at all | Go back to the profiler: confirm its share first, then optimize |

## 4. Performance regression guardrails (holding on to "extreme")

Finishing the optimization isn't the end — without guardrails, one casual refactor three months later gives it all back:

1. Write the benchmark for each critical hot function as a **repeatable test** (a BenchmarkDotNet project / a Unity Performance Test) and commit it.
2. Run it periodically in CI, compare against the baseline, and alert when regression exceeds a threshold (say 15%).
3. Put a header comment on the hot function: "This function is a performance hotspot; changes require re-running XxxBench. Baseline: mean X ns / 0 B" — a warning sign for future maintainers (including AI).
