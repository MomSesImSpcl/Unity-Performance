# Routing evaluation

Two independent agents evaluated the pre-follow-up snapshot and updated skills
against the five prompts in routing-cases.json. They read selected instructions
and reported routing decisions. They did not execute Unity tasks or dispatch the
skills' production review protocols. The updated evaluator repeated the first
case after its observed discovery failure was corrected.

| Case | Observation | Final result |
|---|---|---|
| Transform enumeration explanation | Baseline loaded three unnecessary workflow references. First revision lacked a direct route to the precise preserved rule. | Added direct paragraph-level routing; evaluator found the rule without a full sibling workflow. |
| UI module performance review | Workflow remained reachable; wording could imply step 2 applied only to edits. | Step 2 now explicitly includes reviews and optimization. Source is still required to perform the actual review. |
| Zero-GC engineering plan | Commitment, inventory and execution routed correctly. | Validation, reporting, guardrails and independent review remain required before delivery. No source-dependent findings were fabricated. |
| Constant naming question | Both versions routed to naming guidance. | Correct focused route; project conventions take precedence. |
| Winter poem | Neither version selected a plugin skill. | Unrelated request stays outside plugin scope. |

For the first case, evaluator-reported whitespace word counts decreased from
approximately 3,448 to 824 (entry point plus selected reference content). This is
a single routing observation, not a tokenizer measurement or general efficiency
benchmark. Other routes can load more entry-point text because routing conditions
are now explicit. Review and plan cases intentionally retain substantial rules.

Structural validation passed: three skill frontmatters, 43 direct reference links,
local Markdown file targets, contents lists for references over 100 lines,
preservation hashes for the three navigation-only changes, and four JSON manifests.

## Limits

These evaluations used Codex subagents, not Claude host activation tests. They
test instruction selection and reachability, not Unity runtime performance,
full review quality, measured token usage, latency, or statistical reliability.
The review and planning prompts intentionally defer source provision; they cannot
establish that a complete implementation preserves every rule in practice.
Use representative Unity project fixtures and actual Claude runs for those claims.

## Guidance used

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Anthropic skill creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)
- [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
