# Naming and style: five-language casing quick reference

The only purpose of a name is to **let the reader know what it is, in what unit, and in which direction, without clicking into the definition**. Format (casing) is settled once by the table below; all remaining effort goes into semantics.

## §1 Four-language casing quick reference

PascalCase = `PlayerState`, camelCase = `playerState`, UPPER_SNAKE = `MAX_RETRY`.

| Element | C# | Go | C++ [DEFAULT] | Java |
|------|-----|-----|------|------|
| Types (class/struct/enum/interface) | PascalCase; interfaces prefixed `I` (`IDamageable`) | PascalCase (exported) / camelCase (package-private); interfaces idiomatically end in `-er` (`Reader`) | PascalCase | PascalCase; no interface prefix |
| Methods / functions | PascalCase | PascalCase (exported) / camelCase (package-private) | camelCase (members and free functions alike) | camelCase |
| Locals / parameters | camelCase | camelCase; very short in short scopes (`i`, `ok`, `ctx`) | camelCase | camelCase |
| Private fields | `_` + camelCase (`_hpCurrent`); Unity serialized fields commonly use `m_` or bare camelCase — follow the project | camelCase | `_` suffix or `m` prefix — pick one per project | camelCase |
| Public fields / properties | PascalCase (properties); a public mutable field is itself a violation, see cohesion | PascalCase (exported means public) | camelCase; encapsulate rather than expose | camelCase + getter/setter |
| Constants | PascalCase (`MaxRetryCount`), or UPPER_SNAKE per project | Pascal/camelCase (Go doesn't use UPPER_SNAKE) | `kMaxRetry` (k prefix) or UPPER_SNAKE, per project | UPPER_SNAKE |
| Enum members | PascalCase | Type prefix + PascalCase (`ColorRed`), or an iota group | `kPascal` or UPPER_SNAKE | UPPER_SNAKE |
| Generic parameters | `T`, or `T` + a semantic name (`TState`) | Lowercase word or single letter (1.18+) | `T` / semantic PascalCase | Single uppercase letter (`T`, `K`, `V`) |
| File names | PascalCase = the primary type's name, one primary type per file | all-lowercase snake (`rate_limit.go`) | Per project (lowercase snake is common) | PascalCase = the public class name |
| Packages / namespaces / modules | PascalCase namespaces | **All-lowercase single word; no underscores, no camelCase** (`ratelimit`) | Lowercase namespaces | All-lowercase, dot-separated |
| Macros (C++ only) | — | — | UPPER_SNAKE, and avoid macros where possible | — |

**[HARD RULE] Within one repository, one element gets exactly one spelling.** The table is the default absent a project convention; where the project already has one (especially for C++ and Unity serialized fields), the project governs — but it must be consistent repo-wide.

### §1.1 Lua quick reference (game scripting / hot-update contexts, [DEFAULT] camel family)

Lua has no mandated community casing standard (the standard library is all-lowercase; open-source libraries mostly use snake_case), but game teams generally use the camel family to align with the host C#. Absent a project convention, follow this table:

| Element | Spelling | Example |
|------|------|------|
| "Class" / module table | PascalCase, file name == module name | `BattleUnit.lua` → `local BattleUnit = {}` |
| Module functions / methods | camelCase; public methods defined with `:`, statics with `.` | `function BattleUnit:takeDamage(dmg)` |
| Locals / parameters | camelCase | `local hpCurrent` |
| Private convention | `_` prefix (Lua has no real privacy; the prefix is the contract, and external access is rejected) | `self._stateMap` |
| Constants | UPPER_SNAKE, gathered at the top of the module or in a Const table | `local MAX_RETRY = 3` |
| Globals | **No new globals.** Genuinely needed global entry points are whitelisted and PascalCase; everything else is `local` | See the Lua section of language-hard-rules |
| Event / protocol names | Identical to the C# and server-side literals; don't restyle | Cross-language symbols follow the defining side |

- **[HARD RULE] Before adding a per-file header that `local`izes the library functions you use** (`local ipairs = ipairs`, etc., per project custom), check whether the project already has a shared header template — if it does, use it.
- All the §2 rules (boolean and function semantics, units in names, no information-free words) apply equally to Lua.

## §2 Semantic rules (ten times more important than casing)

1. **[HARD RULE] Names carry units and coordinate systems**: `timeoutMs` / `delaySec`, `speedMetersPerSec`, `posWorld` / `posLocal`, `sizeBytes`. A great many production incidents historically come down to "milliseconds passed as seconds" — putting the unit in the name is the last line of defense outside the type system.
2. **[HARD RULE] Boolean names read as a question and are semantically positive**: `isReady` / `hasLoaded` / `canAttack`; no double negatives (`notDisabled`). The same goes for functions returning booleans (`IsAlive()`, not `CheckAlive()` — `Check` doesn't tell you what comes back).
3. **[HARD RULE] Function name = verb + object, and it must be honest**: `LoadConfig()` may not also mutate global state on the side; side effects belong in the name (`LoadAndCacheConfig`). Reads without side effects use a noun or Get; expensive operations may not masquerade as properties (doing IO inside a C# property is a review rejection).
4. **[DEFAULT] Use symmetric words in pairs**: `Open/Close`, `Begin/End`, `Acquire/Release`, `Push/Pop`, `Add/Remove` — no mixing like `Open/Destroy`. An asymmetric pair means the lifecycle design has a problem.
5. **[DEFAULT] No information-free words**: `data`, `info`, `manager`, `util`, `helper`, `process()`, `handle()`, `doStuff()`. A plague of `Manager` means responsibilities were never thought through — go back to cohesion §1, split the responsibilities, then name them. Permitted exception: domain idioms (such as Unity's `GameManager` where the project has already made it a convention).
6. **[DEFAULT] Abbreviation rules**: a repo-wide whitelist of domain abbreviations (`HP`, `CD`, `UI`, `Id`) is fine; abbreviations longer than two letters capitalize only the first letter in camel-family names (`HttpClient`, not `HTTPClient` — Go is the exception, where `HTTPClient` / `ID` are idiomatically all-caps per official Go style). Invented abbreviations (`calcDmgMul`) are rejected; write it out as `CalcDamageMultiplier`.
7. **[DEFAULT] The larger the scope, the longer the name**: a loop variable `i` is fine; symbols exported across files must be self-explanatory; global constants spell out the full context (`BattleMaxUnitCount`, not `MaxCount`).
8. **[DEFAULT] Collection names use a plural or a quantifier**: `players`, `pendingTaskQueue`. Type-in-the-name forms like `playerList` are only for when `playerSet` / `playerMap` coexist and need distinguishing.
9. **[DEFAULT] Names don't record history**: `NewLoginPanelV2Final` is rejected. Versions and old-versus-new belong to git; the current code contains only "the one name that is correct now." Superseded implementations are either deleted or isolated in a `Legacy` namespace/directory.

## §3 Frequent rulings (cite directly in review)

| Anti-example | Ruling | Fix |
|------|-----|-----|
| `float delay = 3;` | Missing unit | `float delaySec = 3f;` or a TimeSpan/Duration type |
| `bool flag`, `int temp` | Information-free | Write the state it actually represents: `bool isReconnecting` |
| `GetPlayer()` creates a player internally | Name doesn't match | `GetOrCreatePlayer()` |
| `Update2()`, `NewUpdate()` | History in the name | Delete the old one, keep a single `Update()` |
| `ProcessData(Data data)` | Doubly information-free | Use the real semantics: `ApplyRewardDrop(RewardDrop drop)` |
| C# `public int hp;` | Casing + encapsulation, both violated | `public int Hp { get; private set; }` or private `_hp` |
| Go package named `myUtils` | camelCase package name + "util" | Split by responsibility into lowercase packages like `retry`, `clock` |
| C++ member `int count` shadowed by a local `count` | Shadowing | Standardize members as `count_`; enable `-Wshadow` |
| Java constant `maxRetry` | Constant in camelCase | `MAX_RETRY`, and move it to the class it semantically belongs to |

## §4 Style clauses (the part outside the formatter)

- **[HARD RULE] A formatter is mandatory repo-wide**: `dotnet format` (or IDE + .editorconfig), `gofmt` / `goimports`, `clang-format`, `spotless` / `google-java-format`. Formatting arguments end at the tool's configuration; reviews don't discuss whitespace.
- **[DEFAULT] Initialize at the point of declaration**, and declare variables near their first use. C++ always initializes directly — no bare "declare now, assign later" variables.
- **[DEFAULT] Early return first**: guard clauses return illegal and boundary cases at the top of the function so the main logic never grows an indentation level; delete the `else` that follows a `return`.
- **[DEFAULT] One thing per line**: no comma expressions chaining multiple side effects, no nested ternaries; every step of a fluent chain should be readable and nameable (LINQ / Stream are themselves restricted on hot paths — see language-hard-rules).
