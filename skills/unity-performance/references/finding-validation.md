## Pseudo-optimization checks

Shared by unity-performance (performance findings) and csharp-zero-gc (allocation items). A pseudo-optimization is a finding that is "factually correct, benefit zero": the site is identified precisely, but the line never runs, or a lower layer already handled it. Run every finding through these checks before reporting it, because a confident wrong finding costs the user more than a missing one.

1. **Reachability**: does the code, or the allocation, actually run?
   - Are there call sites? Grep the whole repo, and watch for reflection, hot-update and serialized UnityEvent calls.
   - Are the serialized fields bound? An unassigned reference in a prefab means the dependent branch never runs, so the loading and allocation behind it never happen.
   - Is the branch condition always true or always false? A static switch field assigned in exactly one place makes the other branch dead, along with every allocation inside it.
   - Is there a gate upstream? Look for an early `return`, an API the platform doesn't support, an undefined macro, development-build-only code, or a framework that already disabled the node.

   If you can't say under what conditions it runs (or allocates), don't report it. An unreachable finding wastes the user's review time and erodes trust in the rest.
2. **Already handled below**: has the engine, framework, importer, compiler or BCL already done this? Examples:
   - TMP's `text` setter already early-outs on an equal value, so a dirty check on top only adds a getter round trip.
   - `SetActive` with the same value already early-outs.
   - The texture importer's max size already downsamples at import time, whatever the source size.
   - The platform's default compression is already ASTC.
   - The path loader already short-circuits identical paths, and concurrent loads are already coalesced by an existing static memo.
   - The target runtime's enum comparer is already non-boxing.

   Confirm the layer below hasn't done the work before you add a dirty check or a cache.
3. **Self-consistent prescription**: does the fix solve the fact you stated? A classic failure: you establish that the logging macro *is* defined on the target platform, so `[Conditional]` strips nothing, and then you still prescribe "add `[Conditional]`" to remove boxing in log arguments. Another: you note that the image format has no alpha channel, then count disabling alpha as a gain. Also check that the fix itself holds up: can that delegate field bind an instance method, does the API exist, will it compile?
4. **Order-of-magnitude truth**: is the frequency per frame or event-driven? A refresh coalesced by a dirty flag is not per frame. Is the number a configured cap or the real peak? Particle cost tracks live particles, not the cap field. Is it on-disk size or runtime footprint? Is the table dozens of rows or tens of thousands? For allocations, a few hundred bytes on a one-time init path is not the same as a few hundred bytes per frame. If you can't state the frequency, don't mark the item high-benefit.

   Doubt about magnitude only lowers the benefit tier; it doesn't delete the entry. Magnitude calls are the most subjective, and wrongly dropping a real problem costs more than keeping a weak one. Delete an entry only when you have concrete order-of-magnitude counter-proof *and* the target is not on a per-frame or high-frequency event path. Otherwise downgrade it, keep it, and note the real magnitude.
5. **Side effects of the fix**: these risks are easy to under-report.
   - **Reuse and pooling** can break an upstream "reference-equal, so skip the refresh" check, leaving entries permanently showing stale content. Treat this as the top risk in zero-GC work, because pooling is its core technique.
   - **Static caches of config data** break when a hot update replaces the table instance wholesale, leaving the cache pointing at the old table forever.
   - **Bypassing an encapsulation** (an extension method, a utility function) drops the rules inside it, such as forced async loading or per-row degradation fallbacks.
   - **Reused buffers** are not reentrant, so nested calls trample each other.
   - **Moving a closure's comparison token into an instance field** breaks async callbacks that used the captured epoch, path or id to decide "is this response stale". As an instance field the staleness test becomes a tautology: every callback believes it is the newest, so an old response overwrites newer content. Instead, compare against the callback's own parameters. They already carry the values from when the request was issued, so nothing is captured and no closure is created. Whenever a fix moves where a staleness or race check reads its value from, first ask: after this change, can two concurrent requests still be told apart?

   Stating a risk costs nothing, and an unreported one can ship a regression.

**Keep the lists separate.** Only changes that are measurably better on the skill's own axis go on its main list: faster for unity-performance, less allocation for csharp-zero-gc. Anything that should be fixed but won't improve that axis goes in its own section. For unity-performance, that's the correctness red flags in [reporting](reporting.md). For example, switching a mock to the real service adds a network round trip, and setting the log level correctly adds a stack capture. Mixed into the performance list, these read as negative optimizations.
