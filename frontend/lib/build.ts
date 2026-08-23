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
 * Short enough to read off somebody's screen over the phone, long enough that
 * `git show` finds it. Seven characters is what git itself abbreviates to.
 *
 * Nothing exports the full sha, because nothing needs it: Sentry stamps every
 * issue with its own copy, see the `release` note in `lib/sentry.ts`, so this
 * is only ever read by a person.
 */
export const buildLabel = (): string => (SHA === '' ? 'dev' : SHA.slice(0, 7));
