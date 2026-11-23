import { render } from '@testing-library/react';
import Sparkline from './Sparkline';

describe('Sparkline', () => {
	it('draws one point per rating and marks where it ended', () => {
		const { container } = render(<Sparkline elos={[1000, 1040, 1020, 1080]} />);

		expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(4);
		expect(container.querySelector('[data-end]')).not.toBeNull();
	});

	it('keeps a flat season on the page', () => {
		const { container } = render(<Sparkline elos={[1000, 1000]} />);

		expect(container.querySelector('polyline')?.getAttribute('points')).not.toContain('NaN');
	});
});
