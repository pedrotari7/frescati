import * as stylex from '@stylexjs/stylex';
import { fireEvent, render, screen } from '@testing-library/react';
import { stylesFor, stylesOf } from '../test/stylex';
import { Field, NameSearch, RangeInput, Select, TextInput } from './Field';

const noop = () => {};

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
		const onChange = vi.fn();
		render(<TextInput placeholder='Name' onChange={onChange} />);

		fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Alice' } });

		expect(onChange).toHaveBeenCalled();
	});
});

describe('Select', () => {
	it('renders its options and reports a change', () => {
		const onChange = vi.fn();

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

describe('NameSearch', () => {
	// The label is what a screen reader gets and the placeholder is what
	// everybody else does. Both say the same words on purpose.
	it('labels itself for a screen reader as well as on screen', () => {
		render(<NameSearch value='' onChange={noop} />);

		expect(screen.getByLabelText('Search by name')).toBe(screen.getByPlaceholderText('Search by name'));
	});

	// The value comes from the screen, so the box reports the text rather than
	// the event and the caller can hand it straight to a `useState` setter.
	it('reports the typed text rather than the event', () => {
		const onChange = vi.fn();
		render(<NameSearch value='' onChange={onChange} />);

		fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'marco' } });

		expect(onChange).toHaveBeenCalledWith('marco');
	});

	it('shows what the screen currently has', () => {
		render(<NameSearch value='anna' onChange={noop} />);

		expect(screen.getByLabelText('Search by name')).toHaveValue('anna');
	});

	// `type='search'` is what gets the phone keyboard a search key and the
	// browser its own clear button.
	it('is a search field', () => {
		render(<NameSearch value='' onChange={noop} />);

		expect(screen.getByLabelText('Search by name')).toHaveAttribute('type', 'search');
	});
});
