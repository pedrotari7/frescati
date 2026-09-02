import * as stylex from '@stylexjs/stylex';
import { fireEvent, render, screen } from '@testing-library/react';
import { stylesFor, stylesOf } from '../test/stylex';
import { Field, RangeInput, Select, TextInput } from './Field';

/* The chevron is scenery, so a tap has to reach the control underneath it. */
const expected = stylex.create({ untappable: { pointerEvents: 'none' } });

describe('Field', () => {
	it('labels its child control', () => {
		render(
			<Field label='Venue name'>
				<TextInput defaultValue='Frescati IP' />
			</Field>
		);

		expect(screen.getByLabelText('Venue name')).toHaveValue('Frescati IP');
	});

	it('shows an optional hint below the control', () => {
		render(
			<Field label='Venue name' hint='Shown to players in the calendar'>
				<TextInput />
			</Field>
		);

		expect(screen.getByText('Shown to players in the calendar')).toBeInTheDocument();
	});
});

describe('TextInput', () => {
	it('forwards standard input props', () => {
		const onChange = jest.fn();
		render(<TextInput placeholder='Name' onChange={onChange} />);

		fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alice' } });

		expect(onChange).toHaveBeenCalled();
	});
});

describe('Select', () => {
	it('renders its options and reports a change', () => {
		const onChange = jest.fn();

		render(
			<Select aria-label='Weekday' defaultValue='2' onChange={onChange}>
				<option value='1'>Monday</option>
				<option value='2'>Tuesday</option>
			</Select>
		);

		fireEvent.change(screen.getByLabelText('Weekday'), { target: { value: '1' } });

		expect(onChange).toHaveBeenCalled();
		expect(screen.getByLabelText('Weekday')).toHaveValue('1');
	});

	// `appearance-none` is what lets a select share the text inputs' styling,
	// and it takes the platform's arrow with it. Without a replacement these
	// are indistinguishable from a TextInput, which is what they were.
	it('draws a chevron, since appearance-none removes the native one', () => {
		const { container } = render(
			<Select aria-label='Weekday' defaultValue='2'>
				<option value='2'>Tuesday</option>
			</Select>
		);

		expect(container.querySelector('svg')).toBeInTheDocument();
	});

	it('keeps the chevron out of the way of a tap', () => {
		const { container } = render(
			<Select aria-label='Weekday' defaultValue='2'>
				<option value='2'>Tuesday</option>
			</Select>
		);

		expect(stylesOf(container.querySelector('svg'))).toEqual(
			expect.arrayContaining(stylesFor(expected.untappable))
		);
	});
});

describe('RangeInput', () => {
	it('shows the current value as its own readout by default', () => {
		render(<RangeInput aria-label='Randomness' value={30} readOnly />);

		expect(screen.getByText('30')).toBeInTheDocument();
	});

	it('shows a custom label instead of the raw value when given one', () => {
		render(<RangeInput aria-label='Randomness' value={30} valueLabel='30%' readOnly />);

		expect(screen.getByText('30%')).toBeInTheDocument();
		expect(screen.queryByText('30')).not.toBeInTheDocument();
	});
});
