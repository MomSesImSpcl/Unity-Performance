# UGUI / TextMeshPro specific optimization

UI stutter has essentially one root cause: **Canvas rebuilds.** When any Graphic goes dirty (position, size, color, text, or enabled state changes), the entire Canvas it belongs to must re-merge its mesh. The smoking gun in the Profiler: high cost in `Canvas.SendWillRenderCanvases` (layout + vertex rebuild) and `Canvas.BuildBatch` (batching).

## 1. Canvas splitting (the first principle)

**Split Canvases by rate of change, isolating the moving from the static:**

```
HUD Canvas (static frame: backdrop, borders — almost never changes)
├─ Child Canvas: health/mana bars (change every frame)
├─ Child Canvas: floating text / damage numbers (created and destroyed frequently)
└─ Child Canvas: minimap (changes at a fixed rate)
```

- A nested Canvas cuts off dirty propagation: changes inside a child Canvas no longer trigger a rebuild of the parent.
- Don't take it to an extreme: each Canvas is an independent batch and draw, so splitting too finely raises DrawCalls instead. Rule of thumb: 2–4 tiers by rate of change.
- **Hide UI with `canvas.enabled = false` or CanvasGroup.alpha = 0 (+ blocksRaycasts = false), not SetActive(false)**: reactivating via SetActive triggers a full-tree rebuild plus Awake/OnEnable, and is one of the main causes of "the view hitches when it opens." Only use SetActive or destruction for views you're truly done with.

## 2. Rebuild trigger inventory (check them one by one)

| Trigger | Explanation | Fix |
|--------|------|------|
| Modifying Text/Image every frame | Goes dirty → whole Canvas rebuilds | Dirty check: don't write when the value is unchanged (`if (v == _last) return;`) |
| Moving UI element positions every frame via animation or code | Transform changes trigger layout | Isolate moving elements into a child Canvas; for pure translation animation, move the whole Canvas's RectTransform where possible |
| Layout Group (V/H/Grid) + ContentSizeFitter | Any child change recomputes the whole group's layout; nested, the cost is exponential | Disable layout components on runtime views: position them, then disable — or hard-code the anchors when authoring the view. Dynamic lists compute their own coordinates |
| Abusing `LayoutRebuilder.ForceRebuildLayoutImmediate` | Forces a synchronous rebuild | Call it once on the single frame that genuinely needs it |
| Toggling elements with `SetActive` every frame | Rebuild + lifecycle callbacks | Use `enabled` / alpha / scale = 0 instead |
| Runtime `SetParent` to change depth or move containers (highlighting a card, or reparenting an avatar to the top layer and back during a results sequence) | The Canvases of **both** the old and new subtrees go dirty and rebuild in cascade — and this usually happens on the frame with the heaviest effects. A per-player serial sequence means two full rebuilds per player | Raise the depth in place with a child Canvas's `overrideSorting + sortingOrder`; or move only a proxy highlight frame, leaving the element's own depth alone |
| Using a transparent color as "hidden" per Image (setting color alpha = 0 / a hide color — especially on large state-switching elements) | A transparent Graphic is still in the registry, the raycast list, and the rebuild (cullTransparentMesh saves only mesh rendering, not these); it still goes dirty and rebuilds on state change | Express hiding with `image.enabled = false` (component-level, with no OnEnable/OnDisable lifecycle chain); use color/alpha only for elements that genuinely tween a fade; hide whole groups with a CanvasGroup |
| Animator attached to UI | The Animator writes properties every frame even when values don't change → dirty every frame | Replace UI animation with a tween library (DOTween and similar, which write only while animating) |

## 3. Raycasting and events

- **Turn Raycast Target off by default**: Image/Text/RawImage have it checked on creation, yet 95% of elements never need to receive clicks. Audit the whole project (an editor script can batch-disable them) — GraphicRaycaster's traversal cost is proportional to the number checked.
- Set `CanvasGroup.blocksRaycasts = false` wholesale on decorative full-screen UI layers.
- Delete redundant GraphicRaycaster components (each raycast traverses every Raycast Target under its own Canvas).

## 4. Scrolling lists (inventory / leaderboard / chat)

Long lists **must be virtualized (recycled)**: instantiate only the visible area plus a buffer (about the viewport count + 2 rows), and recycle off-screen cells by rebinding their data as you scroll. Laying out several hundred cells directly means a frozen open, a memory explosion, and a rebuild storm while scrolling.

- Hand-rolled: listen to `ScrollRect.onValueChanged`, compute the first visible index from the content offset, and move cells by changing their anchored positions.
- Off the shelf: LoopScrollRect, EnhancedScroller, or non-UGUI solutions all work — what matters is the *recycling* semantics.
- Pair it with: caching component references inside a cell at acquisition time (attach a View script to the cell that holds the references; never `transform.Find` each time).

## 5. TextMeshPro

- **Allocation-free text updates**: `tmp.SetText("HP {0}/{1}", hp, maxHp)` (TMP's built-in formatting produces no string); never use `"" + n` for numbers-only changes.
- For rapidly changing numbers (damage, gold counters), maintain a `char[]` and use `SetCharArray`, or add a dirty check with rate limiting (refreshing every 0.1 s is visually indistinguishable).
- Font atlases: a Dynamic font repeatedly repacks its atlas when there are many rare glyphs, causing stutter. For Chinese projects, **pre-bake a static atlas of common characters plus a dynamic fallback font**. Size the atlas to need (a 4096-and-up Chinese atlas costs meaningful memory — monitor it in the Memory Profiler).
- `enableWordWrapping` and Auto Size add layout cost; turn them off in list cells wherever you can (Auto Size binary-searches the font size and is especially expensive).
- Outline, Underlay, and similar material effects add vertex and pixel cost. Have many small texts share one material preset, and avoid changing material properties per text (which instantiates a material and breaks batching).

## 6. UI rendering cost (GPU side)

- **Overdraw is the UI's main GPU cost**: layers of full-screen semi-transparent backdrops (fake blur, vignettes, masks) are very expensive on mobile. Check with the Overdraw view; use opaque where you can; and set `canvas.enabled = false` on views that are hidden behind others instead of continuing to draw them.
- For click regions, use an overridden `Rectangle` / empty Graphic (participates in raycasting, emits no vertices) rather than laying down a transparent Image.
- The `Mask` component is based on the stencil buffer: each Mask costs two DrawCalls and breaks batching. Use **RectMask2D** for list clipping (pure shader clipping, cheap).
- UI atlases: put the small sprites of one view into the same SpriteAtlas to reduce texture switches; use 9-slice instead of stretching a large image.
- A camera-space Canvas costs extra matrix work compared to Overlay; if you don't need to interleave 3D, use Screen Space - Overlay.

## 7. Acceptance checklist (walk through it during a UI-specific review)

1. `Canvas.SendWillRenderCanvases` < 1 ms in the Profiler (mobile)
2. Dynamic elements and the static frame live on different Canvases
3. Project-wide, the number of checked Raycast Targets equals the number of genuinely interactive elements
4. No enabled Layout Group / ContentSizeFitter at runtime
5. All long lists are virtualized
6. All text updates go through SetText / a dirty check; GC Alloc in the Profiler's UI section is 0
7. Hidden views are `canvas.enabled = false`, not covered up and still rendering
8. Mask → RectMask2D (unless an irregular mask is genuinely required)
