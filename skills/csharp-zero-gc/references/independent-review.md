## Independent adversarial final review

Once the inventory is complete, dispatch an independent subagent that took no part in it to re-review the whole list — and you must reserve a subagent slot for it (if the concurrency cap is saturated, this stage never runs at all). Don't do this step yourself: whoever built the list can't see its own blind spots. It is mandatory when delivering a *plan* — a plan is meant to be executed, and no-op items mixed into the list waste a proportional amount of work; worse, errors like "inflated remediation scope" make people think they're done when they aren't. It may be skipped when you're only handing over a rough lead list.

The final review does three things:

1. Run every item through the [pseudo-optimization checks](../../unity-performance/references/finding-validation.md); on a hit, delete or downgrade it and record the counter-evidence line number.
2. For every item marked "high allocation" or "per frame," argue the opposing case: deliberately construct an argument that the item does *not* hold — look for a gate, for unreachability, for the layer below already handling it, for a framework fallback. Only when that construction fails does the item pass. Don't kill items on evidence-free suspicion ("theoretically there might be another guard"): the cost of killing a real allocation site exceeds the cost of letting a false one through.
3. Cross-reconcile, looking for the three things a per-item pass can't see: whether a gate or early-out reported by this very list makes the allocation paths described by several other items structurally unreachable; grouping by "which single change resolves it," where multiple items in a group are one root cause split apart and should be merged; and whether the same point is double-counted across the three states (list, exemptions, audit bucket).

Apply the final review's conclusions: killed items don't appear in the final plan. Append one line at the end of the report: `pseudo-optimization checks deleted a; opposing-case deleted or downgraded b; cross-reconciliation merged c`.
