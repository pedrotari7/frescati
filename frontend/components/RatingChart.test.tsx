import { render, screen } from '@testing-library/react';
import RatingChart from './RatingChart';

/** The `d` of the drawn line, as the `x,y` pairs it was built from. */
const linePoints = (): [number, number][] => {
	const paths = document.querySelectorAll('path');
	const d = paths[paths.length - 1].getAttribute('d') ?? '';

	return d
		.replace('M', '')
		.split(' L')
		.map(pair => pair.split(',').map(Number) as [number, number]);
};

describe('RatingChart', () => {
	it('draws nothing until there are two points to join', () => {
		const { container } = render(<RatingChart values={[50]} label='One game' />);

		expect(container).toBeEmptyDOMElement();
	});

	it('spreads the points evenly across the full width', () => {
		render(<RatingChart values={[40, 50, 60]} label='Three games' />);

		expect(linePoints().map(([x]) => x)).toEqual([0, 50, 100]);
	});

	it('puts a higher rating higher up', () => {
		render(<RatingChart values={[40, 60]} label='Two games' />);

		const [[, first], [, second]] = linePoints();
		expect(second).toBeLessThan(first);
	});

	it('flattens a career that has barely moved rather than magnifying it', () => {
		render(<RatingChart values={[50, 51]} label='Barely moved' />);
		const flat = linePoints();

		render(<RatingChart values={[30, 70]} label='A real climb' />);
		const climb = linePoints();

		const rise = (points: [number, number][]) => points[0][1] - points[1][1];
		expect(rise(flat)).toBeLessThan(rise(climb));
	});

	it('labels the chart for a screen reader', () => {
		render(<RatingChart values={[40, 50]} label='Rating across 2 games, from 40 to 50' />);

		expect(screen.getByRole('img', { name: 'Rating across 2 games, from 40 to 50' })).toBeInTheDocument();
	});
});
