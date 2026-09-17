# Fallow

Every check this repo had before reads one file at a time. Fallow reads the import graph, so it catches what is wrong between files rather than inside one: an export nothing imports any more, a file nothing reaches, a dependency nothing needs, a cycle. None of those is a type error or a lint error, which is why every suite could be green while they piled up.

The first run reported 24 findings in 0.15 seconds. It was wrong about four of them, all cases where the thing is reached by something other than an import, and those four are written down in the config with their reasons. The other twenty were real and are gone, and deleting them surfaced four more that had been hiding behind them.

It also measures duplication and complexity, and both gate. The repo does not pass that gate yet; "What fails" below has the numbers.

## What runs it

| surface | command | when |
| --- | --- | --- |
| `.husky/pre-commit` | `scripts/bin/fallow --quiet` | every commit |
| `scripts/bin/fallow-gate` | the same run, as a `PreToolUse` hook | Claude Code, before `git commit` or `git push` |
| `.github/workflows/fallow.yml` | `fallow-rs/fallow@v3.26.0`, `auto-changed-since: false` | every pull request |
| `.github/workflows/fallow.yml` | the same, never failing | every push to main |

All four run the **whole repo**, not the files a change touches. `fallow audit` is the changed-file command and is what all three gates ran first; the bare combined run is the one with no scope. The difference is the point: a finding cannot wait out of the way in a file nobody has edited this week. On the CI side that is what `auto-changed-since: false` turns off, because the action scopes to the PR by default.

All four read `.fallowrc.jsonc`, so they agree on what a finding is. The three gates run the same command with the same settings, on purpose: a gate that disagrees with the one before it is one people learn to route around.

The pull request job is also the only one that writes anything back. It posts a comment and uploads SARIF to code scanning, so a finding lands as an annotation on the diff line that caused it rather than in a log.

The main job never fails. Everything it could find has already been merged, and the pull request job has already said it once. It is there to keep code scanning current and to record a health score so the next run can say which way it moved.

Fallow is not in either deploy job's `needs`. The suites those wait on answer "does this work"; fallow answers "is this tidy", and a tidy finding is not a reason to hold a working commit back from the group. The comment above `deploy-backend` in `ci.yml` says the same thing at more length.

## Running it by hand

```
pnpm fallow                       every analysis, whole repo
pnpm fallow:audit                 the same checks, scoped to one change
pnpm fallow dead-code             unused files, exports, dependencies, cycles
pnpm fallow health --targets      complexity, ranked by what to fix first
pnpm fallow dupes                 clone groups
pnpm fallow fix --dry-run         what auto-fix would remove
```

**Use `pnpm fallow`, not `pnpm exec fallow`.** Both end up at the same binary when the node in `.nvmrc` is active, and only the first one works when it is not. `node_modules/.bin/fallow` is a JavaScript launcher that picks a native binary from `process.arch`, and fallow ships one package per architecture, so the only one installed is whichever matched the node that ran `pnpm install`. This machine answers a bare `node` with an x64 build while the tree is arm64, so the launcher looks for `@fallow-cli/darwin-x64`, finds nothing and exits 1.

`scripts/bin/fallow` skips the launcher and runs the binary, which never cared what node reports. It is the same shape of problem as the JDK in `scripts/emulators.sh`, one layer down, and it is fixed the same way.

That script is also why the Claude Code gate is ours rather than the one `fallow agent install` generates. The generated one has `audit` hardwired into it, so it can only ever check the diff, and it looks fallow up with `command -v` and **exits 0 when it cannot find it**, after one line on stderr that a `PreToolUse` hook never displays. Installed as written it stopped gating and said so where nobody was looking, which is how the architecture mismatch turned up. `scripts/bin/fallow-gate` keeps the good half of it, the tokeniser that tells `git -C dir commit` from `git log commit.txt`, and fails closed.

It also runs fallow twice on the blocking path, deliberately. `fallow --format json` exits 0 whether or not it found anything, even with `--fail-on-issues`; only the human form sets exit 1. So the verdict comes from that and the JSON is fetched only to hand the agent the detail. The passing path is one run.

`fallow agent status` reports the Claude gate as `absent`, which is correct rather than broken: it recognises its own handler by the exact command it writes, and `.claude/settings.json` points at ours. A `fallow agent install` would put its own handler back and quietly return the gate to the diff. Run the installer with `--dry-run` first and read what it says about `.claude/settings.json` before applying anything.

The commit hook is the backstop for exactly this. It calls `scripts/bin/fallow` by path, so it never looks anything up, and that script exits 1 rather than 0 when it cannot find a binary. If the Claude gate ever regresses to failing open, the commit a moment later still stops.

## What fails and what only tells you

`audit.gate` is `all` rather than fallow's `new-only` default. It matters less now that the gates run the whole repo, where there is no inherited-versus-introduced split to make, but `fallow audit` is still the right command for reading a single change and the setting keeps that reading strict too.

`duplicates.threshold` is `0.01`, which is how zero tolerance has to be spelled: fallow reads a literal `0` as no threshold at all, which is what left duplication reported and unfailable while every rule above it was an error. It was a ratchet on the way here, sitting just above wherever the repo was, 3.99 then 2.45, 1.85, 1.45, 1.25. It is the destination now.

Gating, all error tier: unused files, unused exports, unused types, unused dependencies, unresolved imports, circular dependencies, duplicate exports, boundary violations, and any function over cyclomatic 20 or cognitive 15.

Reported and never gating: large functions, styling drift, and the whole of `fallow health` beyond the two complexity ceilings and CRAP.

Complexity is worth calling out, because it does not follow the severity settings the other rules do. A function over a threshold is **always** an error, whatever `rules` says, so the two ceilings above are the only part of health that can block a commit.

### The gate is red, on purpose

Arming it and passing it are two different days. Where the repo stands:

|             |                                                           |
| ----------- | --------------------------------------------------------- |
| dead code   | 0 findings, and holding                                   |
| duplication | 1.20% across 22 clone groups, against a threshold of 0.01 |
| complexity  | 26 functions over cyclomatic 20 or cognitive 15           |

Duplication started at 3.99% across 37 groups. What is left of it is the tail: six groups are five to nine lines of incidental similarity and six have both halves inside one file. The complexity half has barely moved and is the bigger one, concentrated in page components, `TournamentPage` at 560 lines and cyclomatic 48, `SeasonAdminPage` at 455 with fourteen hooks, `PlayerPage` at 317. Those are restructurings of screens people use daily, and `pnpm test:e2e` is the only thing that proves one still works.

There are four complexity suppressions, each with its reason, and every one of them marks a refactor rather than a decision. `pnpm fallow suppressions` lists them.

## CRAP is off, deliberately

CRAP weights a function's complexity by how well tested it is, which makes it the most interesting number fallow prints here and the one that still cannot be gated. All three coverage configs moved to the Istanbul provider for this, paying a dependency and a slower run, because Istanbul's format is the only one fallow reads.

It was not enough, and the measurement is worth keeping. With both coverage maps merged, **9 findings got real coverage and 76 were still estimated**. The provider was never the binding constraint: the complexity lives where no suite produces coverage at all, 34 findings in `frontend/app`, whose pages have no unit tests and are exercised by Playwright, 22 in `backend/scripts` and `backend/tests`, 4 in `scripts`.

So `health.maxCrap` is 10000, a threshold that cannot fail, which is documentation rather than a check. It is written down as one on purpose. It becomes a real threshold the day the app-router pages have unit tests, or the day Playwright emits an Istanbul map.

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
