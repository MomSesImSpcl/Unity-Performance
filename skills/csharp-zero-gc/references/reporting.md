## Output specification

1. **Lead with the tier and the scope**: is this remediation targeting L1, L2, or L3, and which systems does it cover? Legacy projects default to the five-step route — state which step you're on.
2. **The remediation list has three columns**: allocation site (file:line + bytes per frame) → the approach adopted (yours or cited from a reference file) → expected result after the change (0 B, or reduced to what), sorted by bytes per frame descending.
3. **Every remediation must land a guardrail at the same time**: a newly zeroed path either gets a CI allocation assertion (one that also proves the path ran, per [guardrails](guardrails.md)) or moves into the Analyzer's error directory. A change that zeroes without guarding counts as incomplete.
4. **The acceptance trio** (measured after implementation — not a precondition for producing the list): evidence of 0 B in the Profiler's GC Alloc column, the delta in GC.CollectionCount over an N-minute soak, and the memory peak curve. Lists delivered at the static-analysis stage must annotate every item "pending on-device confirmation."
5. **Give the selection rationale before introducing a third-party library**, and follow the library-adoption discipline in zero-alloc-libraries.md. Libraries outside that list may still be recommended, held to the same standard.
