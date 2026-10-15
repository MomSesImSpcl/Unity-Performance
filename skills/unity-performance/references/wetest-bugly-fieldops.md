# On-device acceptance and live-ops remediation: WeTest (PerfDog) + Bugly/CrashSight

The Profiler during development can only prove "there's no problem on my machine." A complete performance system has three layers:

```
Development: Unity Profiler / Memory Profiler                        → attribute to functions and assets (see profiling.md)
Acceptance:  PerfDog on-device baselines + a cloud low-end device matrix → quantified pass/fail (§1–2 below)
Production:  Bugly/CrashSight crash · ANR · OOM + the PerfSight performance dashboard → real users' problems flowing back (§3–4 below)
```

The three layers feed each other: PerfDog surfaces a symptom → go back to the Profiler to attribute it; a top production stack → reproduce on a cloud device → attribute → fix → re-measure on PerfDog. **Optimizing only at the first layer is self-congratulation.**

## §1 PerfDog metric definitions (the shared language you must agree on before reading a report)

| Metric | Precise definition (official) | How to use it |
|------|-------------------|--------|
| FrameTime | The interval between two displayed frames | The waveform matters more than the mean: a 33 ms mean with a sawtooth shape still *feels* stuttery |
| **Jank** | A single frame that is both >2× the average of the previous three frames **and** >83.33 ms (two film frames, 1000/24×2) | A count of perceptible small hitches; reports give it as occurrences per 10 minutes |
| **BigJank** | Same, but >125 ms (three film frames) | Perceptibly severe stutter — this is the one to watch during acceptance |
| Stutter rate | The cumulative Jank duration as a share of total duration | For comparing across versions and devices |
| Avg(FPS) / Var(FPS) / Drop(FPS) | Mean / variance / dropped-frame count | High variance = unstable, which hurts the feel more than a low mean |
| CPU Usage (App/Total) | Non-normalized utilization; **Normalized** is normalized against the current clock | On phones that throttle heavily you must read Normalized, otherwise "CPU isn't high yet it stutters" gets misjudged |
| Memory (Android) | The **PSS** measure, consistent with the Java API and meminfo | Not the same thing as the Unity Profiler's managed heap: PSS = managed + native + graphics driver + .so. OOM is judged on this |
| Memory (iOS) | Footprint / Real Memory | iOS Jetsam kills processes by Footprint |
| Battery temperature / current | Heat and power draw | The temperature ramp determines the throttled frame drops thirty minutes in (thermal throttling — see profiling.md) |

## §2 Acceptance baselines and usage discipline

**Example baseline (a mid-to-heavy 30 FPS mobile game — calibrate it to your genre and device tiers at project kickoff and freeze it into a table; don't use this one as-is):**

| Metric | Low-end (e.g. the Snapdragon 680 tier) | Mid-to-high-end |
|------|----------------------|--------|
| Avg(FPS) | ≥ 27 | ≥ 29 (30 FPS target) |
| BigJank (/10 min) | ≤ 5 | ≤ 2 |
| PSS peak | ≤ 1.2 GB (on a 4 GB device) | ≤ 1.8 GB |
| Battery temperature | ≤ 42 °C at 30 minutes | Same |
| First-screen / enter-combat load | ≤ 25 s / ≤ 8 s | ≤ 15 s / ≤ 5 s |

Discipline:

1. **Capture with a fixed script**: same device, same scene route, same duration (≥10 min, including the thermal ramp), otherwise cross-version comparison is meaningless.
2. **Low-end devices have veto power**: the acceptance matrix must include the low-end tier that a large share of your users are on; high-end numbers don't represent the population.
3. **Run it every version and store the trend**: export and archive PerfDog data, and compare across versions to find regressions. Where possible, wire PerfDog Service/API into CI and turn the baseline assertions into a release gate (the same idea as the benchmark guardrails in references/benchmarking.md).
4. **A symptom → attribution table:**

| PerfDog symptom | Likely cause | Where to attribute it |
|--------------|-----------|---------------|
| Periodic Jank at regular intervals | GC.Collect | csharp-hotpath.md (zeroing allocation) |
| BigJank on entering a scene or opening a view | Synchronous loading / an Instantiate spike / shader compilation | engine-rendering.md §5 (async loading, InstantiateAsync, warm-up) |
| High CPU App + low frame rate | A logic hotspot | The decision tree in profiling.md |
| High GPU usage + low FPS | A rendering bottleneck | engine-rendering.md §1–2 |
| PSS climbing steadily without dropping back | An asset or managed leak | The Memory Profiler two-snapshot method in profiling.md |
| Fine for the first ten minutes, then frame drops with high temperature | Thermal throttling | engine-rendering.md §6, quality tiers / Adaptive Performance |

WeTest's deep performance analysis (derived from the UPA capability built with Unity) can give you function-level timings, GC allocation attribution, asset redundancy (duplicate textures and meshes), and overdraw on cloud devices — effectively a "Profiler in the cloud." Use it for device-specific problems you can't reproduce locally. **The specific optimization criteria and cases published officially by UPA/Bugly have been compiled into [tencent-optimization-playbook.md](tencent-optimization-playbook.md)** (the memory three-way split, the CPU attribution four-way split, the 200 ms stutter criterion, and the five OOM dimensions); read deep reports according to that handbook.

## §3 Bugly / CrashSight: integration essentials (Unity)

Positioning: Bugly (free, China) and CrashSight (the commercial edition from the same lineage, for multi-platform, console, and overseas titles) share one remediation methodology. Capabilities: native crashes, C# exceptions, ANR, native OOM monitoring, and memory information at the crash site (PSS/VSS/VRAM/Footprint).

**Three hard rules for integration:**

1. **No symbol files uploaded = the reports are garbage.** IL2CPP's `libil2cpp.sym.so` sits under `Temp/StagingArea` in the build directory, and **every release build must archive and upload it** (the same goes for Android .so mappings and iOS dSYMs). For beta builds, set Player Settings' IL2CPP Stacktrace Information to "Method Name, File Name and Line Number" (for release builds, weigh build size against symbolication precision). Without symbols, a native crash stack is a string of addresses and C# line numbers can't be recovered.
2. **Uncaught C# exceptions must be registered for reporting** (through the SDK's log/exception callback). Under IL2CPP, C# exceptions usually **don't crash the app**, so nobody deals with them — but the logic is already broken (unresponsive buttons and corrupted data are both this). Treat the C# exception rate as its own metric with a target of zero.
3. **Tag the reports**: send version, channel, scene ID, and gameplay phase as custom keys. Untagged crashes can only be aggregated by stack; with tags you can answer "was it the new mode?" and "is it a specific device?"

## §4 The remediation loop (what to do once you have data)

**Definitions first**: pick either the device crash rate (affected devices / connected devices) or the occurrence crash rate and stick to it — never mix them. Common industry thresholds: a crash rate in the 0.1%–0.5% range, with premium titles targeting 0.1%; set a separate target for the C# exception rate.

**The top-N method** (a fixed action every version): aggregate and sort by stack — the top 10–20 usually cover 80% of affected devices. File a ticket for each, fix it, and verify it's gone in the next version. Fixes by category:

| Type | Signature | Direction of the fix |
|------|------|---------|
| Native crash | An .so stack, commonly a null or dangling pointer or a third-party SDK | Symbolicate down to the C# line → usually cross-thread access to a Unity API or wrong parameters into a native plugin; for plugin crashes, compare versions |
| Uncaught C# exception | Aggregated NullReference / IndexOutOfRange | Fix by stack; add defenses and the TryGet pattern on high-frequency paths (see csharp-hotpath.md) |
| **ANR** | The main thread unresponsive to input for >5 s (foreground service 20 s, broadcast 10 s) | Read the main-thread stack in the ANR trace: synchronous IO, lock waits, Binder calls, infinite loops. Keep only rendering and light logic on the main thread and move heavy work to Jobs or background threads (jobs-burst-dots.md) |
| **OOM** | Clustered on low-memory devices, with PSS at the crash site near the limit | Establish per-tier memory budgets (in PSS terms); on the asset side compress textures and unload (engine-rendering.md §4); respond to `Application.lowMemory` by proactively releasing cache pools and reducing quality; on iOS watch Footprint |
| Production stutter reports | Aggregated stutter stacks (once SDK stutter monitoring is enabled) | Identify the scene from the stack → reproduce with PerfDog + a cloud device → attribute in the Profiler |

**Release guardrails**: no release until the beta crash rate passes; watch the new top entries for 24 h and 72 h after release (with alert thresholds); put three curves — crash rate, C# exception rate, and the BigJank baseline — on the release health dashboard. PerfSight (the production performance dashboard) adds FPS, stutter, memory, and temperature distributions by device model, letting you identify the worst-hit devices for dedicated work — which is where the justification for a low-end-device initiative comes from.
