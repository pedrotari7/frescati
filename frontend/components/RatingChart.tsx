'use client';

import { useId } from 'react';

/**
 * A career as a line.
 *
 * Plain SVG rather than a chart library: this draws one series with no axes, no
 * legend and no interaction, and the smallest charting dependency costs more
 * gzipped than the whole of this file.
 *
 * The viewBox is stretched to whatever box it is given (`preserveAspectRatio` is
 * off), which is what lets it be a full-width band on a phone and a wider one on
 * a desktop without measuring anything. Two things fall out of that and are
 * dealt with here: the stroke would stretch with it, so it is drawn
 * `non-scaling-stroke`; and a circle would come out an ellipse, so the marker on
 * the last point is a CSS dot pinned to the right-hand edge instead, which is
 * exactly where the last point always is.
 */

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;

/** Keeps the line clear of the top and bottom edges, where the stroke would clip. */
const PADDING = 3;

/**
 * The narrowest range the axis will show. Without it a career that has moved
 * two points gets scaled up into a mountain range, which reads as drama that
 * did not happen.
 */
const MIN_SPAN = 10;

const RatingChart = ({ values, label }: { values: number[]; label: string }) => {
	const gradientId = useId();

	// Two points is the least that is a line rather than a fact already shown as
	// a number in the header.
	if (values.length < 2) return null;

	const low = Math.min(...values);
	const high = Math.max(...values);
	const span = Math.max(high - low, MIN_SPAN);
	const top = (low + high) / 2 + span / 2;

	const x = (index: number) => (index / (values.length - 1)) * VIEW_WIDTH;
	const y = (value: number) => PADDING + ((top - value) / span) * (VIEW_HEIGHT - PADDING * 2);

	const points = values.map((value, index) => `${x(index)},${y(value)}`);
	const line = `M${points.join(' L')}`;

	return (
		<div className='text-brand relative h-24 w-full sm:h-32'>
			<svg
				viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
				preserveAspectRatio='none'
				className='size-full overflow-visible'
				role='img'
				aria-label={label}
			>
				<defs>
					<linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
						<stop offset='0%' stopColor='currentColor' stopOpacity='0.28' />
						<stop offset='100%' stopColor='currentColor' stopOpacity='0' />
					</linearGradient>
				</defs>

				<path d={`${line} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`} fill={`url(#${gradientId})`} />

				<path
					d={line}
					fill='none'
					stroke='currentColor'
					strokeWidth={2}
					strokeLinecap='round'
					strokeLinejoin='round'
					vectorEffect='non-scaling-stroke'
				/>
			</svg>

			<span
				className='bg-brand ring-canvas absolute size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full ring-2'
				style={{ right: 0, top: `${(y(values[values.length - 1]) / VIEW_HEIGHT) * 100}%` }}
				aria-hidden='true'
			/>
		</div>
	);
};

export default RatingChart;
