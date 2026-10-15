# Skill structure migration

## Third follow-up: write-time rules

- New `code-standards/references/unity-write-rules.md` collects every C#/Unity
  hard rule needed while writing code (including the algorithm, space-budget,
  dependency and naming hard rules). For Unity C# writing tasks it replaces
  `core-rules.md` + `language-hard-rules.md`, which also carry review-only rules
  and four other languages. It has `paths: ["**/*.cs"]` frontmatter so it can be
  copied into a project's `.claude/rules/` and load for every `.cs` file.
- The code-standards description now triggers on writing or editing Unity C#.
- zero-GC guardrails: allocation tests must prove the measured path ran
  (per-branch counters plus a canary allocation).
- Tried and reverted: word targets for small-target reports. They cut report
  length by about a third but saved almost no tokens, and graders found lost
  details and one new factual error.
- Not changed: `csharp-hotpath.md`, `allocation-inventory.md` and
  `zero-alloc-patterns.md` cover different depths (point fixes, review method,
  architecture patterns), so merging them would make every route load more.

Write test (a wave spawner script, graded on 14 correctness and performance
checks, single runs):

| Version | Skill files read | Tokens | Checks passed |
|---|---|---|---|
| Before (core-rules + language-hard-rules + 4 references) | 7 | 118.3k | 13/14 |
| Write rules, final wording | 2 | 97.3k | 13/14 |

Intermediate versions scored 12/14: the first rulebook missed the space-budget
and lifecycle hard rules, and a pool-sizing sentence that mixed up warm-up count
and cap caused recurring Instantiate/Destroy churn. Both are fixed in the final wording.

## Second follow-up: deduplication and leaner workflow loads

- The pseudo-optimization checks now live in one file,
  `unity-performance/references/finding-validation.md`, shared with
  csharp-zero-gc (its own copy was removed; independent-review links to it).
- `exploration.md`, `coverage-dimensions.md` and `coverage-inventory.md` were
  merged into `unity-performance/references/review-method.md`.
- `runtime-ladder.md` is no longer read up front for every review; it is read
  before runtime-dependent recommendations or when choosing an optimization layer.
- The three `section-map.md` files and `reference-catalog.md` were removed.
  Cross-references now link files by name; the catalog's "when to read" notes
  moved into the unity-performance routing table.
- Some prohibitions in workflow references were reworded to give the reason.
  The three hash-checked technical references were not touched.
- Each description now states its boundary with the sibling skills.

Measured with four test prompts, each run once per version on its own subagent
(Claude Opus 5.5), using two small Unity fixtures. Every run passed all its graded
checks in both versions.

| Test | Skill files read (before → after) | Tokens (before → after) |
|---|---|---|
| Transform enumeration explanation | 2 → 2 | 65.6k → 65.7k |
| Inventory UI review | 14 → 11 | 115.6k → 116.2k |
| Combat zero-GC plan | 11 → 10 | 131.2k → 124.5k |
| Constant naming question | 2 → 2 | 66.6k → 65.8k |

Single runs only, so differences of a few thousand tokens are within run-to-run
noise. Most of each run's tokens are the agent's own reasoning and output, not
skill text.

## Follow-up: routing and validation

The counts below describe the initial migration, before the follow-up. Current
entry points add explicit routes for conceptual questions, diagnosis and project
work. Full reviews and engineering plans retain their original requirements.
Every reference now has a direct link from its skill entry point. The three
technical references over 100 lines have navigation-only contents lists; their
original content is verified by removing those lists and comparing SHA-256 hashes.
The other original technical references remain unchanged.

Run `node scripts/validate-skills.cjs` for repeatable structural checks.
See `evals/routing-results.md` for independent routing observations and limits.
No percentage here represents measured end-to-end token savings.

## Initial migration

The original technical rules, examples and review requirements are preserved. Entry points now route by workflow stage and topic; numbered sections have moved to references with a section map. Markdown link paths were adjusted for their new locations.

- unity-performance: 5426 → 489 entry-point words; 12 original sections retained; 12 technical references unchanged.
- csharp-zero-gc: 4309 → 341 entry-point words; 7 original sections retained; 3 technical references unchanged.
- code-standards: 3528 → 385 entry-point words; 6 original sections retained; 5 technical references unchanged.

Validation: every original numbered section was compared with its destination after adjusting relative links; existing technical reference contents were checked by SHA-256. These are structural and content-preservation checks, not a runtime evaluation of skill triggering or measured token savings.

Guide: https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf
