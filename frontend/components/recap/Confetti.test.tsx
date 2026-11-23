import { render } from '@testing-library/react';
import Confetti from './Confetti';

const preferMotion = (motion: boolean) => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: motion }));

describe('Confetti', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('throws a handful of pieces that nobody has to read', () => {
		preferMotion(true);
		const { container } = render(<Confetti />);

		expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
		expect(container.firstElementChild?.children.length).toBeGreaterThan(10);
	});

	it('throws nothing when motion is turned down', () => {
		preferMotion(false);
		const { container } = render(<Confetti />);

		expect(container).toBeEmptyDOMElement();
	});
});
