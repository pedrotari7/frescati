import { useEffect, useState } from 'react';

/**
 * Which keys of a list have turned up since the list was first drawn.
 *
 * What was there on the first render is the baseline and never counts, so
 * opening a screen is quiet and only somebody joining while you watch plays an
 * entrance. A key that leaves drops out of the baseline, so leaving and coming
 * back is an arrival like any other.
 *
 * A key stays an arrival for as long as it is in the list rather than for one
 * render. The animation plays once when its element mounts whatever happens to
 * the class after that, and taking it off on the next snapshot would cut the
 * entrance short.
 */
export const useArrivals = (keys: readonly string[]): ((key: string) => boolean) => {
	const [baseline] = useState(() => new Set(keys));

	useEffect(() => {
		const present = new Set(keys);
		baseline.forEach(key => {
			if (!present.has(key)) baseline.delete(key);
		});
	}, [baseline, keys]);

	return key => !baseline.has(key);
};
