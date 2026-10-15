# High cohesion, low coupling: actionable criteria and refactoring moves

Everyone can say "high cohesion, low coupling." This file covers only **how to judge it and how to fix it**. The core lens: cohesion looks at *reasons to change*, coupling looks at *blast radius* — the number of files one requirement change forces you to touch is a direct measurement of coupling.

## §1 Cohesion criteria (what belongs together)

**The test: what changes together lives together; what doesn't, doesn't.** A class or module's single responsibility means exactly one class of requirement can force it to change.

| Symptom | Ruling | Fix |
|------|-----|------|
| The class name can't express its responsibility, or it's named `Manager/Util/Common/Misc` and contains everything | Responsibilities never divided | Group by "whose requirement would change this code," and extract each group into its own type |
| Several groups of methods in one class each use only their own group of fields, with zero overlap | False cohesion (several classes sharing one room) | Split by the field–method usage matrix: one class per connected component |
| Changing one feature means scrolling up and down through several places in the same class (fields, init, update, cleanup) | Organized by "lifecycle phase" rather than by feature | Slice vertically by feature: each feature carries its own init/update/cleanup (componentization, System-ization) |
| An over-long function with section comments `// step1 // step2` | Function-level low cohesion | Extract each step into a private function; the original becomes a table of contents |
| The same three-to-five parameters always appear together (`x,y,z`, `userId,roleId,serverId`) | Data clump | Package them into a struct/record, and pull the functions that only operate on that clump into it |
| A utility class that keeps growing | The sediment tank became a landfill | Once a utility function is bound to a domain type, move it into that type's module |

**Metrics for reference** (trends matter more than absolute values): a low proportion of pairwise field sharing among a class's public methods → split it; a steadily rising average number of files touched per PR → the boundaries are rotting.

## §2 Coupling criteria (what must stay apart)

**The test: dependencies must be one-directional and point toward the more stable side; changing A should not force B to recompile or retest unless B genuinely depends on A's semantics.**

The layering order is inviolable (and is the same on client and server):

```
Presentation / interface layer (UI, handlers) → business layer (gameplay, services) → domain data layer (models, protocols) → infrastructure (network, storage, logging)
```

1. **[HARD RULE] No reverse dependencies**: the data layer importing UI, the protocol layer calling business logic, infrastructure knowing about a specific game mode — all rejected. When a lower layer needs to *notify* an upper layer, use events, callbacks, or interfaces (interface defined in the lower layer, implemented in the upper — dependency inversion).
2. **[HARD RULE] No circular dependencies**: modules A↔B referencing each other means they are actually one module — either merge them, or extract a third module C (the shared abstraction or data) that both A and B depend on. The Go compiler rejects package cycles outright; enforce the same standard in every other language (splitting C# assemblies; C++ forward declarations merely conceal the cycle — do the real split).
3. **[HARD RULE] Keep the surface that depends on concrete types narrow**: across a module boundary expose only interfaces or plain data, never implementation classes; function parameters take the *minimum capability set* (if you're going to iterate, take `IEnumerable` / `span` / a slice — not an entire `List` plus a `Manager`).
4. **[DEFAULT] Knowledge chain ≤ 1**: `a.GetB().GetC().DoThing()` is rejected (Law of Demeter) — either A offers `DoThing` semantics directly, or the caller holds C directly. Plain data structures (DTOs, config trees) are exempt.
5. **[DEFAULT] Inject dependencies at construction time**; grabbing `XxxManager.Instance` inside a method body is banned — global grabs make dependencies invisible, untestable, and unswappable. More than four dependencies is an alarm that the class does too much, not a justification for bundling parameters.
6. **[DEFAULT] Make temporal coupling explicit**: APIs that must be called in order (`Init` before `Use`) should be eliminated by the type system where possible (construction completes means it's usable; a Builder produces an immutable object). Where it can't be eliminated, assert the state at the entry point and report a clear error.

## §3 Choosing inter-module communication

| Relationship | Mechanism | Criterion |
|------|------|------|
| Upper uses lower | Direct call | Naturally legal; dependency direction is correct |
| Lower notifies upper | Event / callback / observer | The lower layer knows nothing of the upper; on C# hot paths use an allocation-free event bus (see csharp-zero-gc patterns §3) |
| Peer modules collaborating | Messages / mediator, or lift it to a shared orchestrator above | Peers may not hold references to each other; two gameplay systems calling each other means an orchestrator above them is missing |
| Cross-tier (client ↔ server) | Protocol layer of pure data (proto / structs); both sides depend only on the protocol package | The protocol package may not contain business logic; field semantic changes go through versioning, never by reusing an old field |
| Module and configuration | Data-driven: the module reads the table, the table knows nothing of the module | Adding a new kind of config entry should not require changing core code (open-closed is cheapest on the data side) |

Event discipline: **an event is "what happened" (past tense, `UnitDied`), not "please do this."** Using events to issue commands (`PlayEffectRequest` flying everywhere) shatters control flow into untraceable spaghetti — commands use direct calls, and whoever is responsible makes the call.

## §4 Refactoring moves (the standard maneuvers for retreating from a coupling site)

1. **Extract an interface downward**: when an upper layer is referenced by a lower one, extract the handful of upper-layer methods actually used into an interface placed in the lower layer (or a separate abstraction package), and have the upper layer implement it.
2. **Extract the shared dependency**: for an A↔B cycle, find the data or abstraction both care about and extract it into C; keep whatever one-directional dependency remains.
3. **Parameterize away globals**: convert `Instance` call sites to constructor injection. When it can't all be done at once, first assemble everything uniformly at the composition root (the entry point), then replace the existing sites incrementally.
4. **Componentize the god class**: split a God Class into components using the §1 usage matrix; the original class degrades into a composition shell and slims down over time. Keeping it alive by "adding one more partial" is banned.
5. **Isolate third parties behind an anti-corruption layer**: SDK, engine, and ORM types may not seep into business signatures; wrap them in your own narrow interface so that swapping vendors changes only that layer. (Unity: `MonoBehaviour` is only a shell, with logic in plain C# classes — this both isolates the engine and makes unit testing possible, which directly benefits the zero-GC and performance testing systems.)

## §5 Review quick checklist

- This PR implements one requirement — why did it touch N modules? Is the boundary drawn wrong?
- Among the new imports/usings/includes, are any of them reverse or cross-layer dependencies?
- Of the newly public types and methods, which could actually be internal or package-private? (A public surface that only ever grows is where rot begins.)
- Is the event publishing a *fact* or a *command*?
- Are there any new `Instance` calls or new globally mutable state?
