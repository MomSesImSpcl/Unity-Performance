# unity-perf

> Based on [tianzhiying/Unity-perf](https://github.com/tianzhiying/Unity-perf) (MIT).

A Claude Code plugin for **Unity / C# game client development**: performance
optimization, zero-GC engineering, and code standards & review.

Written for teams shipping mobile titles, so the guidance is concrete about the
things that actually break on device: thermal throttling, IL2CPP and hot-update
interpreter constraints, PSS budgets on low-end hardware, and the Canvas rebuild
storms behind most UI stutter.

## Skills

| Skill | Triggers on | What it does |
| :---- | :---------- | :----------- |
| `unity-performance` | stutter, frame drops, low FPS, overheating, GC allocation, memory leaks, DrawCalls, overdraw, slow loading, build size, profiling, crash rates — or just "optimize X" | Sets non-negotiable acceptance targets, then walks profiling → diagnosis → fix → verification. 12 reference files cover profiling, engine/rendering, UGUI + TMP, memory & GC internals, C# hot paths, Span/SIMD, Jobs/Burst/DOTS, IL2CPP tricks, benchmarking, baseline anti-patterns, and on-device acceptance plus live-ops triage. |
| `csharp-zero-gc` | "make X zero-GC", zero allocation, GC spikes, per-frame allocation budgets, object pooling, GC regression guards | Produces an *engineering plan*, not a one-off fix: commitment tiers, acceptance criteria, a zero-alloc pattern library, library selection, and Analyzer + CI guardrails so the result survives six months of commits. |
| `code-standards` | writing or editing any Unity C# script, coding standards, "write it to spec", cohesion & coupling, design pattern selection, naming conventions, design-dimension code review | Writing Unity C# loads a compact write-time rulebook (`unity-write-rules.md`) so code is fast and allocation-free from the start. Can also define standards or run a multi-perspective review protocol. Primary language is C#/Unity; reference files also carry Go, C++, Java and Lua rules. |

Each skill uses three levels of progressive disclosure: frontmatter describes
when to select it; `SKILL.md` routes the current task; `references/` supplies
the applicable rules, workflow stages and technical details on demand.
Required review and acceptance procedures remain mandatory when their workflow
applies. A writing task does not need the full code-review protocol, and a
narrow subsystem question does not need every technical reference.

All technical rules are preserved. Workflow references are linked by name
rather than by section number, and the pseudo-optimization checks live in one
file (`unity-performance/references/finding-validation.md`) shared by
unity-performance and csharp-zero-gc. See [MIGRATION.md](MIGRATION.md) for
content-preservation checks and entry-point sizes.

## Install

```bash
/plugin marketplace add MomSesImSpcl/Unity-perf
/plugin install unity-perf@gqy-plugins
```

Then start a new session (or run `/reload-plugins`) and the skills load
automatically — Claude picks them up from the task context, so you usually
don't need to invoke anything by hand. To call one explicitly:

```
/unity-perf:unity-performance
/unity-perf:csharp-zero-gc
/unity-perf:code-standards
```

### Always-on write-time rules (recommended)

Skills load only when Claude decides they apply. To guarantee the performance
rules are in context whenever Claude touches C# in a Unity project, copy the
rulebook into that project's rules folder. Its `paths: ["**/*.cs"]` frontmatter
makes Claude Code load it automatically for `.cs` files, and only then:

```bash
mkdir -p .claude/rules && cp <plugin>/skills/code-standards/references/unity-write-rules.md .claude/rules/
```

The copy doesn't update with the plugin; copy it again after upgrading.

### Try it without installing

```bash
git clone https://github.com/MomSesImSpcl/Unity-perf.git
claude --plugin-dir ./Unity-perf
```

## Requirements

A host that supports skills and the corresponding plugin manifest. This package
contains Markdown guidance, JSON metadata and one small hook script, with no MCP
servers. Some preserved workflows require host capabilities such as
independent subagents, repository inspection and access to profiling evidence.

### Code-standards hook (Claude Code)

Claude often writes simple Unity scripts without loading `code-standards`, however
the description is worded. So the plugin ships a `PostToolUse` hook
(`hooks/hooks.json`, `hooks/cs-review.cjs`): after Claude writes or edits a `.cs`
file, it tells Claude to load `code-standards` and check the change against its
write-time rules. Other files are ignored. It needs `node` on `PATH`. Codex does
not run it.

## Also works with Codex

The repo ships a `.codex-plugin/plugin.json` manifest alongside the Claude Code
one, so the same skill set can be loaded by Codex-compatible hosts.

## Development

Check skill metadata, direct reference coverage, local links, long-reference
navigation, content preservation and manifest JSON from the repository root:

```bash
node scripts/validate-skills.cjs
```

Routing scenarios and evaluation limitations are recorded in `evals/`.

`plugin.config.json` is the single source of truth for both manifests; they are
generated from it. After editing it, regenerate and validate:

```bash
claude plugin validate . --strict
```

## License

MIT — see [LICENSE](LICENSE).
