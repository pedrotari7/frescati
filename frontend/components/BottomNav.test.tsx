import { render, screen } from '@testing-library/react';
import { activeIndexFor, matchesHref, seasonAdminHref, seasonNavItems } from './BottomNav';
import BottomNav from './BottomNav';

const mockUsePathname = jest.fn();

jest.mock('next/navigation', () => ({
	usePathname: () => mockUsePathname(),
}));

describe('seasonNavItems', () => {
	it('builds the four season tabs in order, scoped to the season', () => {
		const items = seasonNavItems('season-1');

		expect(items.map(item => item.href)).toEqual([
			'/s/season-1',
			'/s/season-1/members',
			'/s/season-1/table',
			'/me',
		]);
	});
});

describe('seasonAdminHref', () => {
	it('points at the admin area for the season', () => {
		expect(seasonAdminHref('season-1')).toBe('/s/season-1/admin');
	});
});

describe('matchesHref', () => {
	it('matches the href itself', () => {
		expect(matchesHref('/s/season-1', '/s/season-1')).toBe(true);
	});

	it('matches a nested path under the href', () => {
		expect(matchesHref('/s/season-1/members', '/s/season-1')).toBe(true);
	});

	it('does not match a sibling path that merely shares a prefix', () => {
		expect(matchesHref('/s/season-10', '/s/season-1')).toBe(false);
	});
});

describe('activeIndexFor', () => {
	const items = seasonNavItems('season-1');

	it('picks the tab whose href matches the current path', () => {
		expect(activeIndexFor(items, '/s/season-1/members')).toBe(1);
	});

	it('prefers the deepest matching href, so members does not also light up games', () => {
		expect(activeIndexFor(items, '/s/season-1/members')).not.toBe(0);
	});

	it('returns -1 for a path inside a section href, leaving every tab unlit', () => {
		const index = activeIndexFor(items, '/s/season-1/admin/venue', [seasonAdminHref('season-1')]);

		expect(index).toBe(-1);
	});

	it('returns -1 when nothing matches at all', () => {
		expect(activeIndexFor(items, '/unrelated')).toBe(-1);
	});
});

describe('BottomNav', () => {
	it('marks the tab matching the current path as current', () => {
		mockUsePathname.mockReturnValue('/s/season-1/table');

		render(<BottomNav items={seasonNavItems('season-1')} />);

		expect(screen.getByRole('link', { name: 'Table' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Games' })).not.toHaveAttribute('aria-current');
	});

	it('leaves every tab un-current while inside a section href', () => {
		mockUsePathname.mockReturnValue('/s/season-1/admin/venue');

		render(<BottomNav items={seasonNavItems('season-1')} sectionHrefs={[seasonAdminHref('season-1')]} />);

		for (const label of ['Games', 'Squad', 'Table', 'Me']) {
			expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
		}
	});
});
