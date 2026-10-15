## Diagnostic methodology

Start from the symptom; don't guess. This tree is a fallback starting point — your own diagnostic ability is the primary engine.

```
Low FPS / stutter → check the Profiler Timeline first: what is the main thread waiting on?
├─ Gfx.WaitForPresent dominates → GPU bound → engine-layer dimension (engine-rendering.md as fallback)
├─ User scripts dominate → CPU logic bound → algorithm dimension + hot-path dimension (csharp-hotpath.md as fallback)
├─ Canvas.SendWillRenderCanvases/BuildBatch dominates → UI rebuild → UI dimension (ui-ugui-tmp.md as fallback)
└─ Physics.Processing dominates → physics configuration
Periodic spikes → nine times out of ten it's GC.Collect → sort by GC Alloc to find the allocation source
Stutter only during a specific action (opening a view / spawning enemies / loading) → burst cost → pooling / async loading / spreading across frames
Memory climbing / crashes → leak → two-snapshot comparison in Memory Profiler (profiling.md)
```
