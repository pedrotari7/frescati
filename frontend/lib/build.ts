/**
 * Which build this is.
 *
 * The question this answers is the one that has no answer today: somebody says
 * the app is broken on their phone, and there is no way to find out whether
 * they are running what was deployed an hour ago or what they cached in March.
 * On a PWA that is not a hypothetical, the service worker decides when a phone
 * takes a new bundle, and a chunk missing from a build nobody realised was
 * still in use is a real crash this app has already had.
 *
 * Deliberately not a version number. Nothing here is released, and a hand-kept
 * number would be one more thing to forget to bump; the commit is the identity
 * the deploy already has, and `git show` turns it back into a date and a
 * message.
 *
 * Inlined at build time by `next.config.js` from Vercel's
 * `VERCEL_GIT_COMMIT_SHA`. Empty everywhere else, which covers `next dev` and
 * anybody building this from a clone with no Vercel project behind it.
 */
const SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? '';

/**
 * The repository that sha lives in, as `owner/name`. Inlined next to it by
 * `next.config.js`, which is also where the decision to recognise GitHub and
 * no other git host is written down. Empty wherever the sha is, and empty on
 * its own for a build hosted somewhere this cannot link to.
 */
const REPO = process.env.NEXT_PUBLIC_BUILD_REPO ?? '';

/**
 * Short enough to read off somebody's screen over the phone, long enough that
 * `git show` finds it. Seven characters is what git itself abbreviates to.
 *
 * The full sha does not leave this file. It goes into the link below and
 * nowhere else: Sentry stamps every issue with its own copy, see the `release`
 * note in `lib/sentry.ts`, so this label is only ever read by a person.
 */
export const buildLabel = (): string => (SHA === '' ? 'dev' : SHA.slice(0, 7));

/**
 * Where to go and read that commit, or `null` when there is nowhere to go.
 *
 * The label alone answers "which build is this" only for somebody sitting in
 * front of a clone, and the person being asked is holding a phone. The link
 * turns seven characters into the date, the message and the diff without
 * leaving the phone, which is the same reason the label is shown to everybody
 * rather than only to admins.
 *
 * `null` rather than a link that goes nowhere. A local build is missing both
 * halves, and a build from a git host `next.config.js` declines to link to has
 * the sha but nowhere to send anybody with it.
 */
export const buildCommitUrl = (): string | null =>
	SHA === '' || REPO === '' ? null : `https://github.com/${REPO}/commit/${SHA}`;
