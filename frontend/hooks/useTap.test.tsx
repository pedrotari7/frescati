import { fireEvent, render, screen } from '@testing-library/react';
import { useTap } from './useTap';

const Probe = ({ run }: { run: () => void }) => {
	const tap = useTap(run);

	return (
		<button type='button' {...tap}>
			Press
		</button>
	);
};

const control = () => screen.getByRole('button', { name: 'Press' });

const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 } as const;

describe('useTap', () => {
	it('runs on the press when no click follows, which is the tap during a scroll', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		fireEvent.pointerDown(control(), touch);
		fireEvent.pointerUp(control(), touch);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it('runs once when the click does follow', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		fireEvent.pointerDown(control(), touch);
		fireEvent.pointerUp(control(), touch);
		fireEvent.click(control());

		expect(run).toHaveBeenCalledTimes(1);
	});

	it('marks that click handled, so a Link above it stays put', () => {
		render(<Probe run={vi.fn()} />);

		fireEvent.pointerDown(control(), touch);
		fireEvent.pointerUp(control(), touch);

		expect(fireEvent.click(control())).toBe(false);
	});

	// jsdom has no layout, so the control's box is the origin: a release at 0,0
	// is on it and anything else is off it.
	it('does nothing when the finger slides off before it lifts', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		fireEvent.pointerDown(control(), touch);
		fireEvent.pointerUp(control(), { ...touch, clientX: 80, clientY: 80 });

		expect(run).not.toHaveBeenCalled();
	});

	it('does nothing when the press is cancelled', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		fireEvent.pointerDown(control(), touch);
		fireEvent.pointerCancel(control(), touch);
		fireEvent.pointerUp(control(), touch);

		expect(run).not.toHaveBeenCalled();
	});

	it('runs on a plain click, which is the mouse and the keyboard', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		fireEvent.pointerDown(control(), { pointerId: 1, pointerType: 'mouse', isPrimary: true });
		fireEvent.pointerUp(control(), { pointerId: 1, pointerType: 'mouse', isPrimary: true });

		expect(run).not.toHaveBeenCalled();

		fireEvent.click(control());

		expect(run).toHaveBeenCalledTimes(1);
	});

	/*
	 * What took four e2e specs red. `performance.now()` counts from the moment
	 * the document loaded, so on a screen younger than the window every click
	 * looked like the second half of a press that had never happened, and the
	 * back chevron pressed as soon as the game painted did nothing at all.
	 */
	it('runs a click made in the first moments of a screen', () => {
		const run = vi.fn();
		render(<Probe run={run} />);

		const now = vi.spyOn(performance, 'now').mockReturnValue(12);

		fireEvent.click(control());
		now.mockRestore();

		expect(run).toHaveBeenCalledTimes(1);
	});

	// The modifier is what opens a link in a new tab, and that is the browser's
	// to carry out.
	it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
		'leaves a click carrying %o to the browser',
		modifier => {
			const run = vi.fn();
			render(<Probe run={run} />);

			expect(fireEvent.click(control(), modifier)).toBe(true);
			expect(run).not.toHaveBeenCalled();
		}
	);
});
