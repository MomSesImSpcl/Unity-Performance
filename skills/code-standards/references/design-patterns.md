# Design patterns: selection criteria and anti-patterns

The hard rule comes first: **a pattern solves a problem that has already appeared; it is not adopted to look professional.** Every pattern you introduce adds a layer of indirection, and the cost of that indirection (readability, number of jumps, virtual dispatch on hot paths) must be smaller than the duplication or coupling it removes. When the criteria don't hold, write the most direct code.

## §1 Common situations → pattern selection

### Branch explosion (switch/if dispatching on type)

Escalate in order and stop as early as you can:

1. **Data-driven (lookup table)**: the branches differ only in values or configuration → a table (config file / dictionary / array) plus one piece of generic logic. This is the first choice in game development: adding a new item, buff, or level should not require changing code.
2. **Strategy pattern**: the branches genuinely differ in behavior → an interface with one implementation per branch, registered into a map. Watch out on hot paths: C# interface calls may box or dispatch virtually, so when the set is fixed and performance-sensitive, a `switch` over sealed types or an enum is actually the right answer.
3. **State pattern**: the branch is determined by "which phase we are in" and there are transition rules → an explicit state machine. **[DEFAULT] Game object behavior (AI, combos, UI flows, network sessions) always uses an explicit state machine**, never a pile of `isXxx` booleans fighting each other — three or more related booleans *is* a hidden state machine, so make it explicit. State instances should hold no member data or be pooled and reused; never `new` on every transition (see zero-GC).

### Object creation

| Situation | Pattern | Discipline |
|------|------|------|
| High-frequency creation/destruction (bullets, effects, messages, request contexts) | **Object pool** | The default for game clients and high-QPS servers; pools must have a cap and leak detection; for the unified C# pool-family entry point see csharp-zero-gc patterns §1 |
| Complex creation (multi-step, dependency resolution, assembly from config) | **Factory / Builder** | Only when the creation logic itself is worth encapsulating; a `PlayerFactory.Create()` that merely wraps `new Player()` and does nothing else should be deleted |
| Many similar read-only objects (config rows, atlas frames) | **Flyweight** | Share the immutable part, externalize the mutable part; fundamentally a space optimization, see algorithm §3 |
| Constructors with many optional parameters | **Builder or named arguments** | In C#/Java use a Builder at ≥5 parameters or when there are mutually exclusive groups; the produced object must be immutable (eliminating temporal coupling, see cohesion §2.6) |

### Module collaboration

| Situation | Pattern | Discipline |
|------|------|------|
| Lower notifies upper, one-to-many broadcast | **Observer / events** | Publish *facts*, never *commands* (cohesion §3); every registration needs a matching unregistration (bound to the lifecycle; in Unity, pair it in OnDisable/OnDestroy); on C# hot paths use an allocation-free event bus |
| Requests need queueing / undo / replay / recording | **Command pattern** | The standard answer for lockstep input and editor undo; pool the command objects, never `new` per frame |
| Wrapping a third party / the engine / a legacy interface | **Adapter / anti-corruption layer** | See cohesion §4.5; define the interface by "what I need," not by "what it offers" |
| Layering capabilities onto an object (buffs, equipment affixes) | **Decorator, or composed data** | In games, prefer "additive data" (summing a list of modifiers) over "nested objects" — nesting depth is uncontrollable and hard to serialize |
| Fixed algorithm skeleton with variable steps | **Template method or delegate injection** | Prefer passing a function/delegate (composition); if you use the inheritance form, keep the hierarchy ≤2 deep |
| Funneling a complex subsystem | **Facade** | One narrow interface outward, freedom inward; a facade must not become a god-shell that forwards everything |

### Architecture level (game-oriented)

- **Component pattern (composition over inheritance)**: assemble entity capabilities from components rather than an inheritance tree. Unity works this way natively; design in-house frameworks the same. An inheritance tree ≥3 deep with cross-cutting capabilities (the FlyingSwimmingEnemy problem) means switch to composition immediately.
- **ECS / DoD**: large entity counts (thousands+) with per-frame batch processing → lay data out in arrays (SoA) and turn logic into Systems that scan arrays. For the criteria and the memory-layout payoff see algorithm §4 and unity-performance's jobs-burst-dots.
- **MVC / MVP / MVVM (UI)**: the View only displays and forwards input, logic lives in the Presenter/Model, and the Model knows nothing of the View (the dependency-direction hard rule). The test: if you strip out the UI framework and the business tests still run, the split is correct.
- **Dirty flag**: expensive derived data (bounding boxes, sorted lists, UI layout) is recomputed only after the source changes *and* when it is actually read. The standard answer for UI refresh is **data changes → mark dirty → flush once at the end of the frame**; refreshing immediately on every assignment is banned.

## §2 Anti-patterns (name them directly in review)

| Anti-pattern | Symptom | Fix |
|--------|------|-----|
| **Singleton plague** | `XxxManager.Instance` everywhere; untestable, initialization-order hell, hidden dependencies | Dependency injection / uniform assembly at a composition root; genuinely global things (logging, clock) are funneled down to a small number and injected as interfaces so tests can substitute them |
| **God class** | A several-thousand-line `GameManager` that handles everything | Componentize per cohesion §4.4 |
| **Anemic model + Util everywhere** | Data classes are bare public fields, and the logic that manipulates them is scattered across Util classes | Pull logic that only operates on that data back into the type itself; cross-type flows stay in a Service/System |
| **Over-abstraction** | An interface with one implementation, a wrapper layer that only forwards, extension points "we might need someday" | YAGNI: delete it and abstract on the day the second implementation appears. "How many implementations does this interface have right now?" is a legitimate review question |
| **Inheritance for reuse** | Inheriting to avoid rewriting fields; `protected` fields mutated arbitrarily by subclasses | Replace with composition; use inheritance only for a true is-a relationship satisfying Liskov substitution (a subclass may not weaken the base's promises, throw new exceptions, or empty-implement base methods) |
| **Event-driven spaghetti** | Events used to issue commands; nobody can follow the control flow | Convert commands to direct calls; keep events for broadcasting facts only (cohesion §3) |
| **Omnipotent config switches** | `if(config.useNewLogic)` forks coexisting indefinitely | Switches carry an expiry date; delete the old branch as soon as the rollout completes. Two branches surviving more than one release cycle is rejected |
| **DTO conversion layers** | The same data copied field-by-field three times through Proto→DO→VO | When the semantics are the same across layers, pass it straight through; where isolation is genuinely needed, convert once in an anti-corruption layer — no hand-copying layer by layer |

## §3 SOLID in practice (one-line criteria)

- **S**: see cohesion §1 — exactly one reason to change.
- **O**: adding another "thing of the same kind" (a new skill, item, or command) doesn't change existing code — achieved with a registry or data-driven design, not by punching holes through inheritance.
- **L**: subclasses substitute for the base class invisibly; violation signals are empty subclass implementations, throwing NotSupported, and callers branching on `is` / `instanceof`.
- **I**: interfaces are narrowed to what the caller needs; an interface with 10+ methods where implementers leave most of them empty should be split.
- **D**: business logic depends on abstractions, the abstraction is defined on the consumer's side, and concrete implementations are assembled at the composition root.

**Hot-path exemption**: abstraction has a runtime cost (virtual dispatch, boxing, cache unfriendliness). In the inner frame loop, SOLID yields to data layout and direct calls — draw the abstraction boundary outside the frame (at system assembly time) and run flat data with concrete types inside it. This is not a violation of the standard; it **is** the standard (see algorithm §4 and the L2/L3 rungs in unity-performance).
