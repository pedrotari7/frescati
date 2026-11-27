import { act, render, screen } from '@testing-library/react';
import CountUp from './CountUp';

const preferMotion = (motion: boolean) =>
	vi.stubGlobal(
		'matchMedia',
		vi.fn().mockReturnValue({ matches: motion, addEventListener: vi.fn(), removeEventListener: vi.fn() })
	);

describe('CountUp', () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }));
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('starts from nothing and lands on the number', () => {
		preferMotion(true);
		render(<CountUp value={42} />);
		expect(screen.getByText('0')).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(2000));

		expect(screen.getByText('42')).toBeInTheDocument();
	});

	// An average turnout is the one number here with a fraction, and rounding
	// every frame used to land it on the wrong whole number.
	it('lands on a fraction exactly, rather than rounding it away', () => {
		preferMotion(true);
		render(<CountUp value={11.5} />);

		act(() => vi.advanceTimersByTime(2000));

		expect(screen.getByText('11.5')).toBeInTheDocument();
	});

	it('shows the number straight away when motion is turned down', () => {
		preferMotion(false);
		render(<CountUp value={7} format={value => `${value}%`} />);

		expect(screen.getByText('7%')).toBeInTheDocument();
	});

	it('can count from a number other than nothing', () => {
		preferMotion(true);
		render(<CountUp from={64} value={66} />);
		expect(screen.getByText('64')).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(2000));

		expect(screen.getByText('66')).toBeInTheDocument();
	});
});
