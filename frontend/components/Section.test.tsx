import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { colors, tint } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';
import { stylesFor, stylesOf } from '../test/stylex';
import { ListCard, ListEmpty, SectionHeading, listRow } from './Section';

/*
 * The type a section label is set in, and the line a row draws above itself.
 * Written out here so the test says what it means rather than pointing at the
 * component and agreeing with whatever it happens to do.
 */
const expected = stylex.create({
	heading: {
		color: colors.faint,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},
	divider: {
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},
});

const caller = stylex.create({ spaced: { marginBottom: 12, paddingInline: 4 } });

describe('SectionHeading', () => {
	it('renders a real heading rather than a styled span', () => {
		render(<SectionHeading>App admins</SectionHeading>);

		expect(screen.getByRole('heading', { name: 'App admins', level: 2 })).toBeInTheDocument();
	});

	/**
	 * The spacing is the caller's because it genuinely differs: 12px on the season
	 * home page, 8px elsewhere, none at all where the heading shares a flex row
	 * with a button. Exact equality rather than `arrayContaining` is the point of
	 * this one: the type and nothing besides, so there is no margin of the
	 * component's own for a caller to have to beat.
	 */
	it('carries the type but no margin of its own', () => {
		render(<SectionHeading>Calendar</SectionHeading>);

		expect(stylesOf(screen.getByRole('heading', { name: 'Calendar' }))).toEqual(stylesFor(expected.heading));
	});

	it("takes the caller's spacing alongside it", () => {
		render(<SectionHeading sx={caller.spaced}>Coming up</SectionHeading>);

		expect(stylesOf(screen.getByRole('heading', { name: 'Coming up' }))).toEqual(
			expect.arrayContaining(stylesFor(expected.heading, caller.spaced))
		);
	});
});

describe('ListCard', () => {
	it('renders its rows', () => {
		render(
			<ListCard>
				<p>A row</p>
			</ListCard>
		);

		expect(screen.getByText('A row')).toBeInTheDocument();
	});

	// `divide-y` was a rule about somebody else's children, and StyleX only ever
	// styles the element its class is on. So the line moved down onto the row,
	// where it is a top border with a `:first-child` reset, and the card is left
	// as the glass panel it shares with every other card in the app.
	it('draws the glass card and leaves the dividers to its rows', () => {
		const { container } = render(
			<ListCard>
				<p {...stylex.props(listRow)}>A row</p>
			</ListCard>
		);

		expect(stylesOf(container.firstElementChild)).toEqual(expect.arrayContaining(stylesFor(surfaces.glass)));
		expect(stylesOf(screen.getByText('A row'))).toEqual(expect.arrayContaining(stylesFor(expected.divider)));
	});
});

describe('ListEmpty', () => {
	/**
	 * Inside the card rather than replacing it: a heading with a card under it
	 * reads as "nothing here yet", where a heading with nothing under it reads
	 * as broken.
	 */
	it('says what is missing', () => {
		render(<ListEmpty>Nobody matches that search.</ListEmpty>);

		expect(screen.getByText('Nobody matches that search.')).toBeInTheDocument();
	});
});
