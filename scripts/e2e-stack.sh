#!/usr/bin/env bash
#
# The whole stack for `pnpm test:e2e`, in the shape that costs the least.
#
# Two things make this different from `dev:seeded`, which it otherwise mirrors.
#
# It serves a **production build** rather than `next dev`. That is not only
# about speed, though the speed is the reason it was tried: `next dev` compiles
# each route the first time a test opens it, so the first visit to every screen
# in the suite was a stall on the critical path, and every page load after it
# carried webpack's eval'd modules. The whole run spent about as long compiling
# and re-rendering as it did testing. It is also the more honest thing to test,
# `next.config.js` says out loud that `next dev` is a materially different app
# from the one that ships, and this is the one suite whose job is to check that
# the halves meet in the shape they meet in production.
#
# And the build runs **beside the emulator boot** rather than in front of it. It
# needs nothing from Firestore and Firestore needs nothing from it, so most of
# the twenty-odd seconds it takes hides behind the ten-odd seconds of emulators
# coming up instead of being added to them. The marker file is how the command
# inside `emulators:exec`, a different shell, so no job control reaches it,
# finds out whether that build finished and whether it worked.
#
# It waits for the build **before** seeding rather than after, and that ordering
# is the careful part. `settle` decides the seed is finished by watching the
# triggers until nothing moves for four seconds; a build saturating every core
# beside it starves those triggers, which reads as exactly the same stillness.
# The seed would then declare itself done with a queue still to drain, the
# backlog would land in the middle of the tests, and the headcount `respond.spec`
# waits on would keep moving under it. Overlapping the boot is free; overlapping
# the seed buys another ten seconds by making the seed unreliable.
#
# The backend build stays in front of everything, because the functions emulator
# reads `backend/lib` as it starts and serves stale handlers otherwise, which is
# exactly the failure that leaves the headcount these tests assert on unmoved.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# A fixed path rather than `mktemp`: `exec` below replaces this shell, so an
# EXIT trap would never fire and every run would leave one behind. Truncated
# here instead, which also means a crashed run can't hand the next one a stale
# verdict. Two e2e runs at once on one machine would fight over it, and over
# port 3000 and the emulators long before that.
STATUS="${TMPDIR:-/tmp}/frescati-e2e-frontend-build"
: > "$STATUS"

# Which of the two frontends the suite runs against.
#
# `next` is the app that ships. `vite` is the port in `frontend/vite/`, built
# from the same components by a different bundler and routed by React Router
# instead of the file tree. The specs know nothing about either: they open URLs
# and click things, which is exactly what makes them the evidence that the port
# behaves like the app. `E2E_STACK=vite pnpm test:e2e` is the whole difference.
# See `docs/build.md`.
STACK="${E2E_STACK:-next}"

if [ "$STACK" = vite ]; then
	BUILD_FRONTEND='pnpm --filter frontend build:vite'
	# `cp` first, and it is not a detail.
	#
	# `next start` serves `frontend/public` from where it sits, so a file written
	# into it after the build is served. `vite build` copies that directory into
	# `dist` and `vite preview` serves the copy, so anything written afterwards
	# is not. The seed writes `public/dev-users.json`, and it runs after the
	# build here on purpose, which leaves the port serving the previous run's
	# cast: 30 specs failing on a "Switch seeded user" button that is looking at
	# stale users. Re-copying after the seed is the whole fix. See
	# `docs/build.md`.
	SERVE_FRONTEND='cp -R frontend/public/. frontend/dist/ && pnpm --filter frontend preview:vite'
else
	BUILD_FRONTEND='pnpm --filter frontend build'
	SERVE_FRONTEND='pnpm --filter frontend start'
fi

# `NEXT_PUBLIC_*` is inlined at build time, so the emulator flag has to be set
# here and not on the server below.
(
	if NEXT_PUBLIC_USE_EMULATORS=1 $BUILD_FRONTEND; then
		printf 'ok' > "$STATUS"
	else
		printf 'failed' > "$STATUS"
	fi
) &

pnpm --filter backend build

# Wait out whatever is left of the frontend build, seed, then serve. Written as
# a variable so the wait is legible: `$STATUS` is this shell's, `\$(cat …)` is
# the inner one's. A failed build leaves 'failed' here and the `&&` chain stops,
# which surfaces as the webServer never coming up rather than as a suite that
# tested the last build somebody made.
serve=$(cat <<SHELL
while [ ! -s "$STATUS" ]; do sleep 0.5; done &&
[ "\$(cat "$STATUS")" = ok ] &&
pnpm seed &&
$SERVE_FRONTEND
SHELL
)

exec scripts/emulators.sh "$serve"
