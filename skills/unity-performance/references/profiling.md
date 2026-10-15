# Measurement and localization workflow (the prerequisite for all optimization)

## Tool matrix

| Tool | How to open | What question it answers |
|------|---------|----------------|
| Unity Profiler | Window > Analysis > Profiler | Where did this frame's time go? Who is allocating GC? |
| Profile Analyzer (package) | Install via Package Manager | Statistical comparison of two recordings before and after (mean / median / outlier frames) |
| Memory Profiler (package) | Install via Package Manager | What is holding memory? What grew between two points in time? (Leak localization) |
| Frame Debugger | Window > Analysis > Frame Debugger | Which DrawCalls did this frame issue? Why didn't they batch? |
| Physics Debugger | Window > Analysis > Physics Debugger | Collider distribution / which objects are participating in physics |
| RenderDoc / Xcode GPU / AGI | External tools | The truth inside the GPU (bandwidth, overdraw, shader cost) — use these when the Unity Profiler's GPU module is unreliable |

## Standard data capture procedure

1. Build with **on-device + Development Build + Autoconnect Profiler** (editor data is only good for rough localization and is never a conclusion).
2. Reproduce the problem scene, record ≥300 frames, and save the `.raw` data (the pre-optimization baseline — you'll compare against it when re-measuring).
3. In the CPU Usage module, **sort by Time ms** to find cost and **sort by GC Alloc** to find allocation. Switch to the **Timeline view** to see the waiting relationships among the main thread, render thread, and job threads.
4. The conclusion must land on a specific function: localization is only complete when you can write it as `XxxSystem.Update() 4.2 ms, 1.2 KB/frame`.

**WARNING**: Deep Profile has enormous overhead of its own (it instruments every function). Use it only to localize a small section of code for a short period; its absolute numbers are untrustworthy — read only the relative proportions.

## CPU-bound vs GPU-bound (the most important first split)

Look at what the end of the main-thread Timeline is waiting on:

| Symptom | Verdict | Direction |
|------|------|------|
| High proportion of `Gfx.WaitForPresentOnGfxThread` | The GPU can't keep up; the CPU is waiting | GPU-bound → engine-rendering.md |
| High proportion of `WaitForTargetFPS` | You hit the target frame rate and are waiting on vsync | No bottleneck (or there's budget to spare) |
| User scripts / engine modules fill the frame | CPU-bound | csharp-hotpath.md / the corresponding system |
| The render thread's `Gfx.*` is saturated while the GPU is idle | Too many DrawCalls submitted (a CPU-side rendering bottleneck) | Batching / GPU Resident Drawer |

Quick corroboration: halve the render resolution (`Screen.SetResolution`, or URP Render Scale = 0.5). A large FPS jump → GPU-bound; almost no change → CPU-bound.

## Permanent instrumentation: ProfilerMarker

Mark the hotspots in your own systems — it costs nothing (automatically stripped in Release) and makes the Profiler show business names instead of one lump of `Update()`:

```csharp
using Unity.Profiling;

static readonly ProfilerMarker s_SimMarker = new("Game.BattleSim");

void Update()
{
    using (s_SimMarker.Auto())
    {
        // code under measurement
    }
}
```

Paired with `ProfilerRecorder` you can read metrics at runtime (frame time, GC, DrawCalls) for performance water-level monitoring and automated performance test assertions.

## Memory leak localization (Memory Profiler two-snapshot method)

1. Take snapshot A before entering the suspect scene; play for a while (or open and close the view repeatedly), return to the same state, and take snapshot B.
2. Use **Compare Snapshots** and sort by diff: is the growth in managed objects (a C# leak — commonly a static collection accumulating, or an event subscription never removed) or in native resources (Textures/Meshes never unloaded, AssetBundles never Unloaded)?
3. For managed leaks read **Path to Root** (who is holding on to it); for asset leaks check Addressables Release, `Resources.UnloadUnusedAssets`, and material instances (`renderer.material`).

A common **false leak**: the Mono/IL2CPP heap growing and never returning memory to the OS is normal behavior. Watch the gap and the trend between **Reserved vs Used**, not the absolute value.

## Frame budget reference (by target device)

| Platform / target | Frame budget | Suggested for logic | For rendering |
|----------|--------|-------------|---------|
| Mobile 30 FPS | 33.3 ms | ~15 ms | ~15 ms (leave thermal headroom; plan against a real budget of ~22 ms total) |
| Mobile 60 FPS | 16.6 ms | ~7 ms | ~7 ms |
| PC/console 60 FPS | 16.6 ms | ~8 ms | ~8 ms |

On mobile, watch for **thermal throttling**: smooth at the start and dropping frames ten minutes in is usually heat-induced downclocking, not code suddenly getting slower. Use the Adaptive Performance package (Samsung GameSDK and others) to read thermal state and scale quality dynamically, or plan the whole stable budget at 70%.

## Acceptance definition

Every optimization commit must be able to answer:
- The **frame time before and after** the optimized point (same scene, same recording method)
- The **GC Alloc/frame** comparison before and after (target 0 B on hot paths)
- If rendering is involved: the **SetPass Calls / Batches** comparison before and after (Game view Stats, or the Profiler's Rendering module)
