# Tencent field optimization handbook (integrating UPA / WeTest / Bugly official practice)

This file collects the **specific optimization criteria, methods, and cases** published officially by Tencent WeTest (UPA deep performance analysis) and Bugly. Its relationship to the other references in this skill: this is the "field criteria library in Tencent's terms" — once it identifies a problem, the details of the fix flow back to the corresponding reference file. Sources: the official interpretation guide for UPA deep performance reports, the 2018 Unite talk "Optimizing Projects with the UPA Tool," and the Bugly Professional documentation. Older entries are annotated with their modern equivalents.

## §1 Memory: reading UPA's three-way split, with an optimization checklist

UPA breaks memory into three parts, each with its own criteria and actions:

### 1.1 Mono Reserved (script memory) — "only rises, never falls; control the peak strictly"

- **Official criterion**: the Mono memory pool only grows and never shrinks (a Boehm characteristic — expansion is never returned), so **the peak is the lifetime footprint**. Every step upward in the report's green line (Reserved) is permanent. Frames dense with the red line mean the pool is expanding frequently, usually during a concentrated allocation period.
- **Fragmentation mechanism**: Mono is a non-compacting memory pool, so allocating many small fragments fragments it — the pool looks large (high Unused) yet can't fit a new large object, and expands further.
- **Official allocation strategy**: **"allocate large memory first, then small."** During loading, allocate the large blocks (pools, big arrays, resident caches) all at once first, then let small allocations fill the gaps; doing it the other way (small fragments claiming space first) shatters the pool.
- **Leak localization**: a steadily climbing Mono line → compare two snapshots to find the growing objects (the procedure is in profiling.md). Common root causes: static collections accumulating, event subscriptions never removed, and pool Release not clearing reference fields (csharp-hotpath.md).
- **Companion C# discipline**: controlling the peak matters more than the mean. A high GC frequency (the talk's case: 9.42 collections during the sampling period) = small fragment allocation every frame → zero it out per csharp-hotpath.md.

### 1.2 Unity Reserved (asset memory) — a per-asset-type checklist

| Asset | Official optimization | Notes |
|------|-----------|------|
| Meshes / FBX | **Disable Read/Write Enable and memory halves outright** (when the CPU doesn't need to read or write it) | The same applies to textures |
| Textures | Resolution **no larger than 2048×2048**; **disable mipmaps** on UI textures; split under-filled atlases into smaller ones (e.g. 1024×512) | |
| Texture formats | At the time: ETC on Android, PVRTC on iOS. **The low-end trap: ETC2 falls back to RGBA32 (4× memory) on GPUs that don't support it** → use ETC1 + separate alpha | Modern equivalent: standardize on ASTC (engine-rendering.md §4). But the "format fallback costs 4×" check remains valid — verify the actual format on device |
| Animation | Reduce frame counts; enable **Optimize GameObject**; load clips on demand rather than keeping them all resident | |
| **Asset duplication rate** | The official formula: **duplicate asset size ÷ total asset size**; when over budget, **prioritize textures that are both large and duplicated many times** | The root cause is usually redundant packing across multiple AssetBundles — solve it by partitioning the dependency chains |

### 1.3 GFX Driver Reserved (graphics driver) — when it's high, look at textures and shaders

High driver-side memory means a texture volume/format problem plus shader variant bloat (for variant stripping see engine-rendering.md §2).

**A classic case (from the Unite talk)**: keeping every texture resident and never releasing it, for the sake of load times → 80+ MB of textures and a 500 MB peak; on a low-end device (Mi 4) the average frame rate was 10 FPS. The fix: careful, on-demand loading plus timely release — "sacrificing memory for load times" must be backstopped by a per-tier memory budget (wetest-bugly-fieldops.md §4, OOM).

## §2 CPU: UPA's four-way attribution split

Official experience: **"logic scripts costing more than rendering is the common ailment of 90% of projects"** — check scripts before suspecting the engine.

| Report signal | Attribution action |
|---------|---------|
| High RenderingTime | Driven by DrawCall count → reduce material variety and batch (engine-rendering.md §1) |
| High ScriptTime | Read **both tables: the top-10 costliest functions and per-frame GC Alloc**; **fix the functions that appear in both first** (one fix, two diseases) |
| High PhysicsTime | Physics configuration (engine-rendering.md §3) |
| High Loading.UpdatePreloading | Correlates with the number of GameObjects and assets being instantiated → spread across frames / go async (§2.1 below) |

### 2.1 Treating single-frame overload (official case criteria)

- The case: one loading function costing 400 ms in a single frame (which players felt as a full second of hitching) — the root cause was "crudely stuffing every loading task into the same frame."
- **The official fix**: load across frames (time slicing; template in jobs-burst-dots.md §4); for scrolling UI lists, **"load a few at a time"** — build only the visible area and spread construction across frames (that is, virtualization, ui-ugui-tmp.md §4).
- **Process recommendations** (the direction the talk gave): plan the preloading layout early in the project; **automate config-table screening** — use tooling to scan for assets referenced by config tables that exceed volume or size limits, catching the problem at commit time rather than in QA. The modern equivalent: bulk InstantiateAsync + SetIntegrationTimeMS (engine-rendering.md §5) is exactly this idea built into the engine.
- Bottleneck criterion: high frameTime + low GPU busy = CPU bound (corroborating the split method in profiling.md).

## §3 Rendering: UPA criteria

- **Reading the dynamic batching benefit curve**: a high yellow line in the report (DrawCalls saved by batching) means batching is paying off; a low one means you're paying CPU cost for nothing → adjust or abandon dynamic batching. Modern equivalent: dynamic batching is essentially retired in the SRP Batcher / GPU Resident Drawer era, but the reading discipline — **"batching must be judged by its benefit curve; turning it on isn't automatically a win"** — applies directly to verifying batch hits in the Frame Debugger (engine-rendering.md §1).
- High SetPassCalls → reduce pass counts and converge material variety; the case: overly complex materials → "either turn it off or simplify the material."
- **Shader math optimization checklist** (the original official entries, still valid on mobile): lower variable precision (use half/fixed where you can), avoid data type conversions, and **avoid power, exponential, and trigonometric functions, substituting approximations** (lookup tables or polynomial approximations).

## §4 Stutter and ANR: Bugly's monitoring principle plus remediation criteria

You have to understand the monitoring principle to read the reported data:

- **Monitoring principle** (official docs): stutter is determined by checking the main thread's message loop (runloop) execution period; the main thread's call stack is sampled at **60 times per second** by default; exceeding the threshold (5 s by default) marks it as a suspected ANR.
- **The long-message criterion**: ANR reports carry the UI thread's message dispatch timeline from just before the ANR — **any single message with Wall Time > 200 ms is deemed a long-running message**, and that is what you remediate.
- **The remediation sequence**: (1) find the long-running message in the pre-ANR message timeline → (2) map it to the sampled stack (down to the function) → (3) fix by category: move synchronous IO, lock waits, and Binder calls off the main thread (jobs-burst-dots.md §4, background threads), which on the Unity side corresponds to "keep only rendering and light logic on the main thread"; infinite loops and very long computations get an algorithm change or frame slicing.
- **Treating stutter that doesn't reach ANR**: enable stutter monitoring and reporting → aggregate stutter stacks by scene tag → reproduce the top stacks with PerfDog + a cloud device → attribute in the Profiler (for the loop see wetest-bugly-fieldops.md §4).
- Same idea on iOS: main-thread runloop monitoring, with deadlock detection as its own category — mind the lock acquisition ordering discipline.

## §5 OOM: Bugly's memory monitoring system — "OOM isn't only the heap"

Bugly Professional breaks memory problems out under **progressive monitoring** (capturing and reporting the scene *before* a resource is exhausted, rather than waiting for the crash when the data is gone):

| Monitoring dimension | How exhaustion shows up | Common root causes in Unity mobile games |
|---------|---------|------------------|
| Java / managed memory | An OOM crash | Assets kept resident and never released (the §1 case), managed leaks |
| **FD (file descriptor) count** | Reports OOM while the heap isn't full; thread creation fails | Uncapped download concurrency, leaked AssetBundle/file handles, unclosed sockets |
| **Thread count** | `pthread_create failed`-style OOM | SDKs and in-house modules spawning thread pools freely; the fix is a converged global thread pool |
| **Virtual memory** | A 32-bit process exhausting its ~3 GB limit (mmap failures) | Large AssetBundle mappings, graphics driver usage; a 64-bit build is the prerequisite for a real fix |
| Native memory | High PSS that the Unity Profiler can't see | Plugin or driver allocation; capture PSS/VSS/VRAM at the crash site as corroboration |

**Remediation essentials**: (1) classify the OOM report by type first (heap / FD / threads / virtual memory) — don't investigate every one as a memory leak; (2) FD and thread counts are **hard numeric limits** (Android commonly caps FDs at 1024, and thread count is bounded by virtual memory) — stress-test both curves before launch; (3) managed-side leaks go back to the two-snapshot method in profiling.md, asset-side ones to the §1 checklist; (4) self-rescue when nearing exhaustion: respond to `Application.lowMemory` by releasing cache pools and reducing quality (wetest-bugly-fieldops.md §4).

## §6 Tencent's performance standard: measurement definitions and usage

The WeTest mobile game quality standard covers seven dimensions: **FPS, CPU usage, PSS memory, GPU usage / video memory (VBO), network traffic, power draw, and device tiering**. The specific thresholds are configured per project on the platform by genre and device tier (wetest.qq.com/solution/standard) — **don't cite the fixed numbers that circulate online.** The correct approach: at project kickoff, set one red line per dimension against your target device matrix, freeze it into the acceptance baseline table in wetest-bugly-fieldops.md §2, and run PerfDog against that table every version.

## §7 C# optimization index (the Tencent C# practices distilled here → where they land)

| Tencent practice | Where it lands |
|-----------|------|
| Mono only rises → control the peak, not the mean | The basis for the discipline throughout csharp-hotpath.md |
| Allocate large before small (anti-fragmentation) | Concentrated pre-allocation during loading: pool warm-up, big arrays, and caches first |
| Fix functions that are both time-expensive and allocation-heavy first | The review sort order, folded into the SKILL.md output specification |
| Single-frame task overload → spread across frames | The time-slicing template in jobs-burst-dots.md §4 |
| Load UI lists a few at a time | Virtualization in ui-ugui-tmp.md §4 |
| Automated config-table screening for oversized assets | An engineering guardrail, paired with CI baselines |
| The >200 ms main-thread long-message criterion | Main-thread budget awareness: move heavy work to the background (jobs-burst-dots.md) |
| Converged thread pools / capped FDs | Concurrency limit design in the download and IO modules |
