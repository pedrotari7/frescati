/**
 * Route parameters as the promise the pages expect.
 *
 * Four screens read `params` with React's `use()`, because Next 15 hands a page
 * its parameters as a promise. The values are on hand synchronously here, so
 * the only job is to wrap them, and the only hard part is that `use()` demands
 * the *same* promise on every render.
 *
 * The obvious `useMemo(() => Promise.resolve(params), [a, b])` is wrong, and
 * wrong in a way that took an end-to-end failure to find rather than a type
 * error. A component that suspends on its first render has its hook state
 * thrown away: React re-renders it from scratch when the promise settles, the
 * memo does not survive, a second promise is built, and that one suspends too.
 * It never converges. React Router runs navigations inside a `startTransition`,
 * and a transition that never finishes keeps the *previous* screen on the
 * page, so the symptom is not a spinner or an error. It is the URL changing to
 * a game while the season list stays on screen, indefinitely.
 *
 * So the cache lives outside React, where nothing can discard it. The key is
 * the parameter values, which is what identity has to mean here: two visits to
 * one game are the same promise, and two different games are not.
 */

/** Every promise handed out, keyed by the values behind it. */
const promises = new Map<string, Promise<Record<string, string>>>();

/**
 * Bounded so a long session cannot grow this without limit. Comfortably more
 * than the screens anybody visits before a reload, and the cost of evicting one
 * still in use is a new promise for it, which is a re-render and not a bug.
 */
const LIMIT = 64;

export const routeParams = <T extends Record<string, string>>(params: T): Promise<T> => {
	const key = JSON.stringify(params);
	const cached = promises.get(key);

	if (cached) return cached as Promise<T>;

	const promise = Promise.resolve(params);
	promises.set(key, promise);

	// Oldest first, which is what a Map's insertion order gives for free.
	if (promises.size > LIMIT) promises.delete(promises.keys().next().value as string);

	return promise;
};
