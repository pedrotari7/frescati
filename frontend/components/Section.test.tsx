import { render, screen } from '@testing-library/react';
import { ListCard, ListEmpty, SectionHeading } from './Section';

describe('SectionHeading', () => {
	it('renders a real heading rather than a styled span', () => {
		render(<SectionHeading>App admins</SectionHeading>);

		expect(screen.getByRole('heading', { name: 'App admins', level: 2 })).toBeInTheDocument();
	});

	/**
	 * The spacing is the caller's because it genuinely differs: mb-3 on the
	 * season home page, mb-2 elsewhere, none at all where the heading shares a
	 * flex row with a button. `classNames` concatenates rather than merges, so a
	 * baked-in margin would leave two competing and let CSS order decide.
	 */
	it('carries the type but no margin of its own', () => {
		render(<SectionHeading>Calendar</SectionHeading>);

		const heading = screen.getByRole('heading', { name: 'Calendar' });

		expect(heading).toHaveClass('text-xs', 'font-semibold', 'uppercase');
		expect(heading.className).not.toMatch(/\bmb-/);
	});

	it("appends the caller's spacing", () => {
		render(<SectionHeading className='mb-3 px-1'>Coming up</SectionHeading>);

		expect(screen.getByRole('heading', { name: 'Coming up' })).toHaveClass('mb-3', 'px-1', 'text-xs');
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

	// Rows inside carry only vertical padding and never a border of their own,
	// which is what `divide-y` buys against the card's rounded corners.
	it('separates rows with divide-y rather than a border each', () => {
		const { container } = render(
			<ListCard>
				<p>A row</p>
			</ListCard>
		);

		expect(container.firstChild).toHaveClass('glass', 'divide-y', 'rounded-2xl');
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
