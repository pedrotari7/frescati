import { hapticLight, hapticMedium, hapticSuccess } from './haptics';

describe('haptics', () => {
	afterEach(() => {
		// @ts-expect-error -- test-only cleanup of a property we add below
		delete navigator.vibrate;
	});

	it('vibrates with a short pattern for a light tap', () => {
		const vibrate = vi.fn();
		Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

		hapticLight();

		expect(vibrate).toHaveBeenCalledWith(10);
	});

	it('vibrates longer for a medium tap', () => {
		const vibrate = vi.fn();
		Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

		hapticMedium();

		expect(vibrate).toHaveBeenCalledWith(20);
	});

	it('vibrates a pattern for success', () => {
		const vibrate = vi.fn();
		Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

		hapticSuccess();

		expect(vibrate).toHaveBeenCalledWith([12, 40, 12]);
	});

	it('is a silent no-op when the Vibration API is unavailable', () => {
		Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });

		expect(() => hapticLight()).not.toThrow();
	});
});
