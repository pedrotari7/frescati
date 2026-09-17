# AGENTS.md

`CLAUDE.md` is the project's brief and this file does not repeat it. Read that one for the domain, the data model, the conventions and the feature docs. This file is only about fallow, the static analysis that gates commits here, and it is imported into `CLAUDE.md` so an agent that reads either one has both.

`docs/fallow.md` is the long version: what is configured and why, what to do when the gate blocks you, and what has been deliberately turned off.

## The gate

A commit or a push runs `fallow` over the **whole repo**, from three places that all agree: `.husky/pre-commit` for a human, `scripts/bin/fallow-gate` as a `PreToolUse` hook for Claude Code, and the `fallow` job on every pull request.

Whole repo, not the diff. `fallow audit` is the changed-file command and is what these ran first; a finding does not get to wait out of the way in a file nobody has edited this week.

What fails: an export nothing imports, a file nothing reaches, a dependency nothing needs, an import cycle, an unresolved import, a function over cyclomatic 20 or cognitive 15, and any duplication at all, against a threshold of 0.01. Large functions and styling drift are reported and do not fail. CRAP is off; `docs/fallow.md` says why.

**The gate does not pass yet.** Dead code is at zero and holding, duplication is 1.20% against 0.01, and 26 functions are over a complexity ceiling. Expect to be blocked, and expect the block to be about something you did not write. That is the trade the whole-repo scope makes, and the backlog is the work. When it blocks, the finding is the answer: delete the dead thing, or, if it is live and fallow cannot see the edge, say so in the config or in a `// fallow-ignore-next-line <rule>` comment with a reason. Reach for the suppression second, and never for a finding you have not checked.

## Running it

Use `scripts/bin/fallow`, or `pnpm fallow`, rather than `pnpm exec fallow`. The launcher in `node_modules/.bin` refuses to start when the active node's architecture does not match the installed binary, which is the normal case on this machine unless `nvm use` has run. The script goes straight to the binary.

```
pnpm fallow                       every analysis, whole repo
pnpm fallow:audit                 what the gate runs
pnpm fallow dead-code             unused files, exports, dependencies, cycles
pnpm fallow health --targets      complexity, and what to refactor first
pnpm fallow dupes                 clone groups
pnpm fallow fix --dry-run         what auto-fix would remove
```

`fallow fix` removes an export keyword or a dependency line, nothing else, and it will happily remove a dependency that is used through something other than an import. Three in this repo are exactly that and are listed in `ignoreDependencies`; read that list before trusting a `fix` run.

<!-- fallow:setup-hooks:start -->

## Fallow local gate

Before any `git commit` or `git push`, run `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to... | Run |
| --- | --- |
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| prove a TypeScript symbol's exact consumers before refactoring | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>` |
| find how one module reaches another | `fallow trace --path <from> <to>` (Reports `reachable: false` instead of failing when no import path exists; type-only hops are reported, not skipped.) |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `fallow audit --base <ref>` |
| read a diff before approving it | `fallow review --base <ref> --brief` (orientation, never gates: deterministic and always exit 0, unlike the audit row) |
| prioritize refactoring | `fallow health --hotspots --targets` |
| ask who owns code | `fallow health --ownership` |
| check untested-but-reachable code | `fallow health --coverage-gaps` |
| consolidate duplication | `fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `fallow flags` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| surface security candidates | `fallow security` |
| understand a finding | `fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |

<!-- fallow:setup-hooks:end -->

The block above is generated by `fallow hooks install` and refreshes on upgrade, so it is left as written. Two lines in it are wrong for this repo: the gate is `all`, not `new-only`, and it is set in `.fallowrc.jsonc`, not `fallow.toml`.
