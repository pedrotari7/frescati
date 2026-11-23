import { render } from '@testing-library/react';
import Burst from './Burst';

const preferMotion = (motion: boolean) => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: motion }));

describe('Burst', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('throws a ring of sparks that nobody has to read', () => {
		preferMotion(true);
		const { container } = render(<Burst />);

		expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
		expect(container.firstElementChild?.children.length).toBe(12);
	});

	it('throws nothing when motion is turned down', () => {
		preferMotion(false);
		const { container } = render(<Burst />);

		expect(container).toBeEmptyDOMElement();
	});
});
