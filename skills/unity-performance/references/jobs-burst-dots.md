# Job System / Burst / ECS: moving heavy computation off the main thread and vectorizing it

Where it applies: large volumes of **homogeneous** computation — batched raycasts and pathfinding, procedural mesh generation, large-scale unit simulation, custom particle and cloth simulation, image and data processing. A single small computation isn't worth turning into a Job (scheduling has its own overhead; rule of thumb: consider it only when the main-thread cost exceeds 0.5 ms and the work is parallelizable).

## 1. C# Job System (multithreading without touching thread primitives)

```csharp
using Unity.Jobs;
using Unity.Collections;
using Unity.Burst;
using Unity.Mathematics;

[BurstCompile]
struct DistanceJob : IJobParallelFor
{
    [ReadOnly] public NativeArray<float3> positions;
    public float3 origin;
    public NativeArray<float> distances;   // each index writes only its own slot → naturally race-free

    public void Execute(int i) => distances[i] = math.distance(positions[i], origin);
}

// Scheduling (main thread):
var job = new DistanceJob { positions = pos, origin = o, distances = dist };
JobHandle h = job.Schedule(pos.Length, 64);   // 64 = items per batch
// …the main thread can do other work first…
h.Complete();                                  // wait only where you need the result
```

Key points:

- Data goes only into **Unity.Collections containers such as NativeArray/NativeList** (unmanaged memory, safe across threads). Choose `Allocator.TempJob` (≤4 frames) or `Persistent` by lifetime, and **you must Dispose when done** (leaks are reported by the safety checks).
- Marking read-only data `[ReadOnly]` lets multiple Jobs read it in parallel; chain dependencies with `JobHandle` (`job2.Schedule(dep: h1)`) rather than completing one and then scheduling the next.
- **Don't Complete on the same frame**: after scheduling, let it run in parallel with rendering and collect the result in LateUpdate or the next frame — that's how you actually get the parallel benefit.
- For bulk Transform operations use `IJobParallelForTransform` + `TransformAccessArray`.

### Engine-supplied batch Job APIs (parallelism without writing a Job yourself)

| API | Replaces | Situation |
|-----|------|------|
| `RaycastCommand.ScheduleBatch` | A loop of Physics.Raycast | Dozens to hundreds of rays per frame (vision, bullets, landing points) |
| `OverlapSphereCommand` and friends (2022.2+) | A loop of Overlap calls | Batched range queries |
| `NavMeshQuery` (experimental) | Synchronous pathfinding | Batched pathfinding |
| Physics multithreaded solver | — | Turn it on directly in Project Settings |

## 2. The Burst compiler (SIMD and GC-free native code)

Enable Burst on a Job (or on a `[BurstCompile]` static method): LLVM compiles the IL into vectorized native code targeting the CPU, commonly giving **10–100×** on math-heavy code, and it works on mobile too (ARM NEON).

Constraints (the HPC# subset):

- Only **unmanaged types**: structs, primitives, NativeContainers, and `Unity.Mathematics` types like float3 and float4x4. **Not allowed**: managed objects, classes, strings, ordinary arrays, boxing, or `throw` (restricted).
- Use `Unity.Mathematics` (`math.xxx`) uniformly for math — it's designed for SIMD. Don't use `Mathf` / `Vector3` inside Burst code (it compiles, but won't saturate vectorization).
- Use `Unity.Mathematics.Random` for random numbers (a value type, reproducible, one instance per thread).
- Debugging: Jobs > Burst > Inspector shows the generated assembly; `[BurstCompile(CompileSynchronously = true)]` guarantees the first call already runs the optimized version.
- It works outside Jobs too: a `[BurstCompile]` static method plus a function pointer (`BurstCompiler.CompileFunctionPointer`) is a good way to speed up a single math-heavy function in place.

## 3. ECS / DOTS (Entities 1.x) — the ultimate move at maximum scale

Data-oriented layout (SoA + contiguous archetype chunks) + fully Job-ified + Burst, supporting tens of thousands of active entities and up (bullet hell, RTS armies, crowd simulation).

Adoption test (assess honestly; don't use it for its own sake):

- ✅ Tens of thousands of homogeneous entities, regular logic, and a team willing to accept a brand-new programming model → worth it
- ⚠️ Hundreds to a thousand entities → the "hybrid mode" above (Manager + Job + Burst) is usually enough and costs far less to adopt
- ❌ Ordinary gameplay / UI / flow logic → don't ECS it

**Hybrid mode (the most common frontier practice)**: a GameObject presentation layer plus an ECS/Job computation layer — logic data lives in NativeArrays processed by Burst Jobs, and each frame writes back a small number of Transforms and animation parameters. Pair the rendering with Entities Graphics or BatchRendererGroup (see GPU Resident Drawer in engine-rendering.md — the same underlying system).

## 4. Main-thread scheduling techniques (the fallback when you don't Job-ify)

- **Time slicing**: split a large task and run a fixed budget per frame:

```csharp
IEnumerator BuildLevel() {
    var t = Time.realtimeSinceStartupAsDouble;
    foreach (var cell in cells) {
        Place(cell);
        if (Time.realtimeSinceStartupAsDouble - t > 0.004) {  // at most 4 ms per frame
            yield return null;
            t = Time.realtimeSinceStartupAsDouble;
        }
    }
}
```

- **Background threads**: pure computation (touching no UnityEngine API) can be thrown onto the thread pool with `Task.Run` or Unity 6's `Awaitable.BackgroundThreadAsync()`, then switched back with `Awaitable.MainThreadAsync()` to apply the result.
- **Rate reduction**: tick non-critical systems at 0.1–0.5 s intervals (AI decisions, pathfinding recomputation) and interpolate the presentation.
