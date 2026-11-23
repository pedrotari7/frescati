'use client';

import { useEffect, useState } from 'react';
import { prefersMotion } from './motion';

const DURATION_MS = 900;

/** Whole numbers stay whole on the way up, and a fraction keeps its one place. */
const places = (target: number) => (Number.isInteger(target) ? 0 : 1);

/**
 * A number that counts up from zero when its slide opens, unless motion is
 * turned down. It eases out, so it races and then settles, and the last frame
 * is the number itself rather than the number put through the easing, which
 * is what an average turnout of 11.5 used to come out of as 12.
 */
const CountUp = ({ value, format }: { value: number; format?: (value: number) => string }) => {
	const [shown, setShown] = useState(() => (prefersMotion() ? 0 : value));

	useEffect(() => {
		if (!prefersMotion()) {
			setShown(value);
			return;
		}

		const started = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const progress = Math.min(1, (now - started) / DURATION_MS);
			setShown(progress < 1 ? value * (1 - (1 - progress) ** 4) : value);
			if (progress < 1) frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [value]);

	const rounded = Number(shown.toFixed(places(value)));

	return <>{format ? format(rounded) : rounded.toFixed(places(value))}</>;
};

export default CountUp;
