import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import type { Game, Season } from '../../shared/types';
import { buildIcsFeed } from '../../shared/calendar';
import { db, REGION } from './lib/firebase';
import { instrument } from './lib/sentry';

/**
 * Serves a season's calendar as `text/calendar` — the only unauthenticated
 * read in the app. A calendar app (Google/Apple/Outlook) polls this with a
 * plain `GET` on its own schedule; it cannot do the sign-in + App Check
 * handshake everything else here goes through, so the token in the URL is the
 * whole of the auth. It is 32 random bytes — see `calendarLink.ts` — which is
 * the only defence available, the same position `csp-report`'s route is in.
 *
 * A season's own read rule already hands this out to anyone signed in;
 * `calendarFeeds`/`seasons/{id}/calendar` are what stand between a plain
 * Firestore read and the same games showing up for someone who never signed
 * in at all — see the comments in `firestore.rules`.
 */

/** Same variable the email transport reads; the feed links back to the app the same way. */
const APP_URL = defineString('APP_URL', { default: '' });

// No `cors` option: calendar apps fetch this directly, never from the app's
// own origin via `fetch`, so there is nothing for CORS to allow — and setting
// the key at all, even to `false`, switches on a middleware wrapper that
// expects a real Node response object, which the test doubles below aren't.
export const calendarFeed = onRequest(
	{ region: REGION },
	instrument('calendarFeed', async (req, res) => {
		// A bad or rotated token is an expected outcome — a stale bookmark, a
		// link that got rotated — not a bug, so it is answered inline rather than
		// thrown: throwing here would route it through Sentry via `instrument`,
		// which is exactly the "authorization layer working correctly" noise
		// `HttpsError` is skipped for on the callable side.
		const notFound = (): void => {
			res.status(404).set('Content-Type', 'text/plain; charset=utf-8').send('Not found.');
		};

		// Real tokens are `randomBytes(32).toString('base64url')` — see
		// `calendarLink.ts` — so anything outside that charset is already a bad
		// token, not a bug. Checking the shape here, before it becomes a Firestore
		// path segment, matters because a `/` in it changes the segment count and
		// makes `db.doc()` throw synchronously: that throw isn't an `HttpsError`,
		// so `instrument()` would report it to Sentry and answer with a bare 500 —
		// on the one route in the app anyone can hit with zero auth.
		const token = typeof req.query.token === 'string' ? req.query.token : '';
		if (!/^[\w-]{16,128}$/.test(token)) return notFound();

		const feedSnap = await db.doc(`calendarFeeds/${token}`).get();
		if (!feedSnap.exists) return notFound();

		const { seasonId } = feedSnap.data() as { seasonId: string };

		const seasonSnap = await db.doc(`seasons/${seasonId}`).get();
		// The season was deleted; `onSeasonDeleted` should have taken this index
		// entry with it, but a stale link is still just a 404, not a crash.
		if (!seasonSnap.exists) return notFound();

		const season = { ...(seasonSnap.data() as Omit<Season, 'id'>), id: seasonSnap.id };

		const gamesSnap = await db.collection(`seasons/${seasonId}/games`).orderBy('kickoff', 'asc').get();
		const games = gamesSnap.docs.map(doc => ({ ...(doc.data() as Omit<Game, 'id'>), id: doc.id }));

		const ics = buildIcsFeed(season, games, { appUrl: APP_URL.value() });
		const filename = season.name.replace(/[^\w\- ]/g, '').trim() || 'frescati';

		res.status(200)
			.set('Content-Type', 'text/calendar; charset=utf-8')
			.set('Content-Disposition', `inline; filename="${filename}.ics"`)
			// The subscriber's own poll interval is the only cache that matters —
			// this must never serve a season admin's own rotate or a game's own
			// edit back stale.
			.set('Cache-Control', 'no-store')
			.send(ics);
	})
);
