/**
 * Tiny vibrations to confirm a tap landed. Silently a no-op on iOS Safari,
 * which doesn't implement the Vibration API, treat it as a bonus, never as
 * the only feedback for an action.
 */

const vibrate = (pattern: number | number[]) => {
	if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
};

export const hapticLight = () => vibrate(10);

export const hapticMedium = () => vibrate(20);

export const hapticSuccess = () => vibrate([12, 40, 12]);
