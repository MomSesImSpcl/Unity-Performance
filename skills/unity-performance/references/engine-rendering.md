# Engine-side optimization: rendering / physics / asset memory (including Unity 6 frontier features)

## 1. DrawCalls and batching (the CPU-side rendering bottleneck)

In priority order, high to low. On modern pipelines (URP/HDRP), reach for these techniques in this sequence:

1. **SRP Batcher** (on by default in URP/HDRP — confirm it hasn't been disabled): merges setup by shader variant; requires materials to use a compatible shader (properties in a CBUFFER). Confirm it's working by looking for "SRP Batch" groupings in the Frame Debugger.
2. **GPU Resident Drawer** (Unity 6, the frontier first choice): enable it in the **Rendering section of the URP/HDRP Asset** (URP requires the rendering path to be Forward+ or Deferred+; HDRP has no such requirement), set BatchRendererGroup Variants to Keep All in Graphics settings, and confirm SRP Batcher is on. Underneath it uses `BatchRendererGroup` to keep the draw data for static GameObject geometry resident on the GPU and merge instances automatically — **saving up to ~50% of CPU rendering submission cost in large scenes** (Unity's own figure: up to 50%), with no code changes and no hand-placed instancing. Caveats: it covers MeshRenderer only (skinned meshes, particles, and VFX Graph are unsupported), and it's an either/or evaluation against Static Batching.
3. **GPU Occlusion Culling** (Unity 6, pairs with the above): uses the previous frame's depth for a Hi-Z test to cull occluded objects on the GPU, **with no baking**, and works in dynamic scenes; addresses overdraw and wasted DrawCalls. Traditional baked occlusion culling still applies to fixed-structure indoor levels.
4. **GPU Instancing**: check Enable Instancing for large numbers of repeats of the same mesh and material (grass, trees, bullet patterns); for procedural mass drawing go straight to `Graphics.RenderMeshInstanced` / `RenderMeshIndirect`.
5. **Static Batching**: the old technique — merges static meshes at the cost of memory (vertex duplication); an either/or evaluation against GPU Resident Drawer.
6. **Atlas and material convergence**: put UI and sprites into a SpriteAtlas; converge the scene's material count (use MaterialPropertyBlock for skinning variants instead of copying materials).

Acceptance metrics: **SetPass Calls** (the most expensive — a shader state change) and **Batches** in Stats/Profiler.

## 2. GPU load (when GPU-bound)

- **Resolution is the biggest lever**: rendering at native resolution on mobile is often waste. The frontier option is **STP (Spatial-Temporal Post-processing, Unity 6)**: spatio-temporal upscaling that reconstructs a high-resolution image from a low-resolution one using history frames plus motion vectors (the FSR2/DLSS idea, cross-platform). In URP/HDRP, drop Render Scale to 0.5–0.77 and upscale with STP: 30–50% GPU savings at close to native quality. On older pipelines without STP, use FSR1 or dynamic resolution (Dynamic Resolution + Frame Timing Manager adjusting automatically by GPU pressure).
- **Overdraw**: stacked transparency (effects, full-screen UI images) is the number-one GPU killer on mobile. Check with RenderDoc or the editor's Overdraw view; control particle area and layer count; for UI see ui-ugui-tmp.md.
- **Shaders**: on mobile, avoid per-pixel recomputation (do it per vertex or via a LUT where possible). Handle variant explosion with a Shader Variant Collection plus stripping (many variants → large memory + slow loading + a first-use compilation hitch; pair with warm-up). Prefer `shader_feature` over `multi_compile`.
- **Lighting**: at most one realtime main light, bake the rest. In Unity 6 use **Adaptive Probe Volumes (APV)** instead of hand-placed Light Probes (automatic placement, streamed on demand). Cut shadow distance and cascades to what's needed; be wary of realtime point-light shadows on mobile.
- **Post-processing**: evaluate Bloom / DoF / SSAO item by item on mobile — a single Bloom often costs as much as half the scene's GPU time.

## 3. Physics

| Setting | Recommendation |
|------|------|
| Fixed Timestep | Default 0.02 (50 Hz); for games insensitive to precision, set 0.0333 and save a third of physics cost outright. **Never set it below the render frame time** (death spiral: multiple physics catch-up steps within one frame → more stutter → even more catch-up) |
| Layer Collision Matrix | Uncheck every layer pair that never needs to collide — a zero-cost, high-payoff item |
| Colliders | No MeshCollider on dynamic objects (compose Box/Capsule/Sphere instead); convex MeshColliders are expensive too |
| Auto Sync Transforms | Off (it's already off by default); avoids the sync storm of "change a Transform → immediately query physics" |
| Raycasts | Always pass a LayerMask and a maxDistance; batch them through RaycastCommand (see jobs-burst-dots.md) |
| Rigidbody | Let resting objects sleep properly (don't wake them by applying a tiny force every frame); moving static geometry needs a kinematic Rigidbody, not a bare Collider |

## 4. Assets and memory (loading / build size / residency)

- **Textures**: standardize on ASTC for mobile (a good quality/size balance, works on both iOS and Android); start large UI images at ASTC 6x6; mipmaps on (3D) and off (pure UI); cut Max Size to the actual display size — **90% of memory killers are uncompressed or oversized textures.**
- **Meshes**: enable Mesh Compression; disable Read/Write (leaving it on doubles the memory); tier bone and vertex counts by device (LOD Group, working with the culling systems above).
- **Audio**: long BGM uses Streaming + Vorbis; short SFX use Decompress on Load / ADPCM; don't let a 4 MB wav stay resident as PCM.
- **Loading system (the frontier standard practice)**: **Addressables** replaces Resources entirely — async loading (`LoadAssetAsync` + await), reference-counted unloading (`Release`), remote hot updates, and grouped pre-warming by label. A `Resources/` directory goes into the build wholesale and gets indexed at startup; migrate legacy projects off it gradually.
- **Unloading discipline**: call `Resources.UnloadUnusedAssets()` on scene change (it hitches — put it behind a loading screen); with Addressables, whoever Loads Releases; instances produced by `renderer.material` / `meshFilter.mesh` must be Destroyed manually (or use `sharedXxx` / MaterialPropertyBlock from the start).
- **Build size**: Managed Stripping High + texture compression + audio compression + a Build Report (Editor.log / Build Report Inspector), then cut item by item sorted by size.

## 5. Startup and scene transitions

- Load scenes asynchronously with `SceneManager.LoadSceneAsync` + `allowSceneActivation` to control the activation moment; stream large scenes in and out as Additive sub-scenes.
- **Async instantiation `Object.InstantiateAsync` (2022.3.20f1+ / Unity 6)**: instantiating heavy prefabs no longer blocks the main thread — after snapshotting the source object, most of the work happens asynchronously, leaving only the final integration and Awake on the main thread, and the integration stage can be budgeted per frame with `AsyncInstantiateOperation.SetIntegrationTimeMS()`:

```csharp
// Bulk load: instantiate N asynchronously in one call (enemy waves, filling lists, warming pools);
// supports parent / positions / rotations parameters
AsyncInstantiateOperation<Enemy> op = Object.InstantiateAsync(enemyPrefab, 20, parent, positions, rotations);
op.SetIntegrationTimeMS(2f);          // at most 2 ms of main-thread integration per frame, flattening the spike
yield return op;                       // await in a coroutine; op.completed callback or WaitForCompletion() also work
Enemy[] enemies = op.Result;
// Call op.Cancel() when leaving the scene. This is the first choice for warming object pools on a loading
// screen and for spawning enemies on scene entry — it cures "spawning a wave causes a BigJank."
// Combined with Addressables: LoadAssetAsync for the prefab → InstantiateAsync for the volume.
```

  Note: Awake/OnEnable still fire on the main thread at the integration pace — if the prefab carries heavy Awake logic, going async flattens the peak without reducing the total, so heavy initialization still has to be deferred or spread across frames yourself.
- Put shader warm-up (`ShaderVariantCollection.WarmUp`) on the loading screen to cure "the first cast of an ability hitches."
- Do object pool warm-up (preferably with the bulk InstantiateAsync above) and JIT/metadata initialization (IL2CPP first access to a type) together during loading.

## 6. Quality tiers and adaptation (standard equipment for mobile)

- `QualitySettings.SetQualityLevel` plus a custom tier table: map devices (SystemInfo VRAM / chipset) to low/medium/high, controlling resolution (Render Scale), shadows, post-processing, effect density, and target frame rate.
- The **Adaptive Performance** package (Samsung GameSDK and others): read the device's thermal state and bottleneck hints at runtime, and proactively reduce quality to hold frame rate before throttling kicks in, avoiding a hard drop from thermal throttling.
- Use `FrameTimingManager` to sample real frame times in production and adjust the tier table dynamically via remote config — extending the optimization loop into live operation.
