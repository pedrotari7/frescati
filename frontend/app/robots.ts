import type { MetadataRoute } from 'next';

/**
 * Nothing here is for a search engine.
 *
 * Every page in the app lives under the `(app)` auth gate, and the rules reject
 * an unauthenticated read anyway — so the most a crawler can ever render is the
 * sign-in screen. There is no landing page, no public season, nothing to index:
 * `/` redirects straight to `/seasons`. The group is findable by being sent a
 * link, which is the whole distribution model.
 *
 * It is also the same instinct as the rest of the privacy line — no addresses
 * in Firestore, no Session Replay because it would record a roster of real
 * names. A search index is that last one with a public URL on it.
 *
 * The concrete thing this stops: Googlebot renders with a stubbed
 * `navigator.serviceWorker.register` that rejects, so every crawl reported a
 * failed registration out of `useServiceWorkerUpdate` — three URLs, three
 * releases, no signed-in user behind any of them. Filtering that message in
 * `sentry.ts` would have been the wrong half to fix: `Error: Rejected` from a
 * real phone is a real registration failure, and an `ignoreErrors` entry could
 * not tell the two apart. Not being crawled can.
 *
 * Note this asks a crawler not to *fetch*, which is what stops the render. A
 * URL somebody links to publicly can still appear as a bare entry; keeping it
 * out of the index entirely would need a `noindex`, which is only ever seen on
 * a page that was allowed to be crawled.
 */
const robots = (): MetadataRoute.Robots => ({
	rules: { userAgent: '*', disallow: '/' },
});

export default robots;
