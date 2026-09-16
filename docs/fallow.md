# Fallow

Every check this repo had before reads one file at a time. Fallow reads the import graph, so it catches what is wrong between files rather than inside one: an export nothing imports any more, a file nothing reaches, a dependency nothing needs, a cycle. None of those is a type error or a lint error, which is why every suite could be green while they piled up.

The first run reported 24 findings in 0.15 seconds. It was wrong about four of them, all cases where the thing is reached by something other than an import, and those four are written down in the config with their reasons. The other twenty were real and are gone, and deleting them surfaced four more that had been hiding behind them.

It also reports duplication and complexity. Those do not gate; see "What fails and what only tells you".

## What runs it

| surface | command | when |
| --- | --- | --- |
| `.husky/pre-commit` | `scripts/bin/fallow audit --quiet` | every commit, after the existing checks |
| `.claude/hooks/fallow-gate.sh` | `fallow audit --format json --explain` | Claude Code, before it runs `git commit` or `git push` |
| `.github/workflows/fallow.yml` | `fallow audit` via `fallow-rs/fallow@v3.26.0` | every pull request |
| `.github/workflows/fallow.yml` | the full analysis | every push to main, never failing |

All four read `.fallowrc.jsonc`, so they agree on what a finding is. The three gates run the same command with the same settings, on purpose: a gate that disagrees with the one before it is one people learn to route around.

The pull request job is also the only one that writes anything back. It posts a comment and uploads SARIF to code scanning, so a finding lands as an annotation on the diff line that caused it rather than in a log.

The main job never fails. Everything it could find has already been merged, and the pull request job has already said it once. It is there to keep code scanning current and to record a health score so the next run can say which way it moved.

Fallow is not in either deploy job's `needs`. The suites those wait on answer "does this work"; fallow answers "is this tidy", and a tidy finding is not a reason to hold a working commit back from the group. The comment above `deploy-backend` in `ci.yml` says the same thing at more length.

## Running it by hand

```
pnpm fallow                       every analysis, whole repo
pnpm fallow:audit                 exactly what the gate runs
pnpm fallow dead-code             unused files, exports, dependencies, cycles
pnpm fallow health --targets      complexity, ranked by what to fix first
pnpm fallow dupes                 clone groups
pnpm fallow fix --dry-run         what auto-fix would remove
```

**Use `pnpm fallow`, not `pnpm exec fallow`.** Both end up at the same binary when the node in `.nvmrc` is active, and only the first one works when it is not. `node_modules/.bin/fallow` is a JavaScript launcher that picks a native binary from `process.arch`, and fallow ships one package per architecture, so the only one installed is whichever matched the node that ran `pnpm install`. This machine answers a bare `node` with an x64 build while the tree is arm64, so the launcher looks for `@fallow-cli/darwin-x64`, finds nothing and exits 1.

`scripts/bin/fallow` skips the launcher and runs the binary, which never cared what node reports. It is the same shape of problem as the JDK in `scripts/emulators.sh`, one layer down, and it is fixed the same way.

That script is also why `.claude/settings.json` puts `scripts/bin` on the PATH before calling the gate. Fallow's gate script looks fallow up with `command -v` and **exits 0 when it cannot find it**, after one line on stderr that a `PreToolUse` hook never displays. Without the PATH entry the gate stopped gating and said so where nobody was looking, which is how it turned up here.

Two things follow from that, and both have been checked rather than assumed. `fallow agent status` reports the Claude gate as `absent`, because it recognises its own handler by the exact command it writes and this one has a PATH prefix in front. A `fallow agent install` would rewrite the handler and take the prefix with it, so that is the line to put back after an upgrade. Run the installer with `--dry-run` first: it should say `would write` for `.claude/settings.json` and for the generated table inside `AGENTS.md`, which prettier reflows and fallow then reflows back, and `unchanged` for everything else. Anything else in that list is worth reading before applying.

The commit hook is the backstop for exactly this. It calls `scripts/bin/fallow` by path, so it never looks anything up, and that script exits 1 rather than 0 when it cannot find a binary. If the Claude gate ever regresses to failing open, the commit a moment later still stops.

## What fails and what only tells you

`audit.gate` is `all`, not fallow's `new-only` default. Every finding in a file the change touches counts, not only the ones the change introduced. The looser default exists for a repo adopting fallow on top of a backlog; this one has no backlog, because the first run's findings were fixed rather than grandfathered, so the strict gate costs nothing and is what keeps it that way.

Gating, all error tier: unused files, unused exports, unused types, unused dependencies, unresolved imports, circular dependencies, duplicate exports, boundary violations, and any function over cyclomatic 20 or cognitive 15.

Reported and never gating: duplication, large functions, styling drift, and the whole of `fallow health` beyond the two complexity ceilings.

Complexity is worth calling out, because it does not follow the severity settings the other rules do. A function over a threshold is **always** an error in `audit`, whatever `rules` says, so the two ceilings above are the only part of health that can block a commit.

## CRAP is off, deliberately

CRAP weights a function's complexity by how well tested it is, which makes it the most interesting number fallow prints here and the one this repo cannot feed it. Fallow reads coverage in Istanbul format. `vitest.config.ts` picks the v8 provider instead, for the reasons written in it: it needs no extra package and instruments nothing. So fallow estimates the coverage half from the module graph.

On the first run that estimate produced **70 of 101 complexity findings that breached CRAP and nothing else**, on a repo whose shared logic sits at 99% statement coverage. Scores ran to 2352 against a threshold of 30. Gating on that would have meant blocking commits on a guess.

So `health.maxCrap` is 10000, which is a threshold that cannot fail, which is documentation rather than a check. It is written down as one on purpose: `fallow health` still prints the column, and the day the coverage provider changes it becomes a real threshold again.

Cyclomatic and cognitive complexity are counted from the syntax tree rather than estimated, so those two still gate at their defaults.

## The three dependencies it is wrong about

`ignoreDependencies` in `.fallowrc.jsonc` holds exactly three packages, each used through something that is not an import:

- `@firebase/app`, a backend dependency nothing imports, whose removal breaks the deployed container. The README has the long version under "Dependencies".
- `eslint-config-next` and `eslint-plugin-react-hooks`, reached through `frontend/.eslintrc.json` as `extends: ["next/core-web-vitals"]` and a `react-hooks/*` rule block. Fallow reads that config but does not resolve either spelling back to the package behind it.

Everything else the first run called unused really was, and is gone. **`fallow fix` would remove all three**, so read that list before trusting a fix run.

## When the gate blocks you

The finding is usually the answer, and the answer is usually to delete something. Before suppressing anything, check whether it is genuinely reachable:

```
pnpm fallow dead-code --trace <file>:<export>
pnpm fallow dead-code --trace-dependency <name>
pnpm fallow explain <issue-type>
```

If it is live and fallow cannot see the edge, say so where the next person will find it: `ignoreDependencies` or `entry` in the config for a whole package or file, or a `// fallow-ignore-next-line <rule>` comment with a reason on the line itself. `pnpm fallow suppressions` lists every one of them, and the `stale-suppressions` rule reports the ones that have stopped being needed.

There is one deliberate entry point, `frontend/public/sw.js`. Nothing imports the service worker; the browser fetches it from `/sw.js` and registers it at runtime. Naming it as an entry point keeps it and everything it reaches inside the graph, which ignoring it would not.

## Agents

`AGENTS.md` carries the short version of this page and is imported into `CLAUDE.md`, so an agent reading either one gets both. `fallow agent install` also wrote `.claude/skills/fallow`, a pointer to the copy in `node_modules`, so the skill never drifts from the pinned version, and registered `fallow-mcp` in `.mcp.json` alongside Sentry.

Re-running `fallow agent install --harness claude` is idempotent and reports every step as unchanged. Two things about this repo do not survive it: the PATH entry in `.claude/settings.json`, and the rewritten `AGENTS.md`. The second is safe, since fallow refuses to overwrite a file it did not author, but check the first.

Scope it to `--harness claude`. Without that flag it detects Codex and Cursor from the home directory and writes `.codex/config.toml` and `.cursor/mcp.json` into a repo that uses neither.

## Upgrading

The version lives in one place, the `fallow` devDependency in the root `package.json`. The CI action reads that spec rather than pinning its own, so bumping the dependency moves CI with it. The action ref in `fallow.yml` is pinned separately and should be bumped to match.
