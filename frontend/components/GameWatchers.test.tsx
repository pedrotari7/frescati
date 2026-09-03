import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AppUser } from '@shared/types';
import GameWatchers from './GameWatchers';

const user = (uid: string, displayName: string): AppUser =>
	({ uid, displayName, photoURL: null }) as unknown as AppUser;

const USERS = new Map([
	['anna', user('anna', 'Anna')],
	['johan', user('johan', 'Johan')],
	['zara', user('zara', 'Zara')],
]);

const renderWatchers = (props: Partial<React.ComponentProps<typeof GameWatchers>> = {}) =>
	render(<GameWatchers uids={[]} usersByUid={USERS} loading={false} error={null} onReload={vi.fn()} {...props} />);

describe('GameWatchers', () => {
	it('names everyone following the game', () => {
		renderWatchers({ uids: ['anna', 'johan'] });

		expect(screen.getByText('Anna')).toBeInTheDocument();
		expect(screen.getByText('Johan')).toBeInTheDocument();
		expect(screen.getByText('(2)')).toBeInTheDocument();
	});

	// Scoped to the list, because the footer carries a link too, and read off
	// the hrefs, because an avatar's initials sit inside the same anchor as the
	// name and land in its accessible name.
	it('sorts by name rather than by who tapped the bell first', () => {
		renderWatchers({ uids: ['zara', 'anna', 'johan'] });

		const followers = within(screen.getByRole('list')).getAllByRole('link');

		expect(followers.map(link => link.getAttribute('href'))).toEqual(['/u/anna', '/u/johan', '/u/zara']);
	});

	// The profiles arrive on a separate subscription, so a uid can genuinely be
	// here before the account behind it is. A blank chip would read as somebody
	// with no name rather than as one still loading.
	it('still lists somebody whose profile has not arrived', () => {
		renderWatchers({ uids: ['nobody-knows'] });

		expect(screen.getByText('Unknown player')).toBeInTheDocument();
	});

	// The admin's question is "who hears about this", and nobody is a real
	// answer to it, distinct from the list having failed to load.
	it('says nobody is following rather than showing an empty list', () => {
		renderWatchers();

		expect(screen.getByText('Nobody has turned notifications on for this game.')).toBeInTheDocument();
	});

	// Erring towards "we don't know" is the safe direction: a failed read that
	// rendered as "nobody" would be believed, and it is the same words.
	it('does not report nobody when the read failed', () => {
		renderWatchers({ error: new Error('nope'), uids: [] });

		expect(screen.queryByText('Nobody has turned notifications on for this game.')).not.toBeInTheDocument();
		expect(screen.getByText("Couldn't load who is following this game.")).toBeInTheDocument();
	});

	it('does not show a count until it has one', () => {
		const { rerender } = renderWatchers({ loading: true });

		expect(screen.queryByText('(0)')).not.toBeInTheDocument();

		rerender(<GameWatchers uids={[]} usersByUid={USERS} loading={false} error={null} onReload={vi.fn()} />);

		expect(screen.getByText('(0)')).toBeInTheDocument();
	});

	// The one thing this card can't do is update itself: the rule that keeps
	// watchers private is what rules out a listener, so the refresh has to work.
	it('reloads on request, and not while it already is', async () => {
		const onReload = vi.fn();
		const { rerender } = renderWatchers({ onReload });

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
		});
		expect(onReload).toHaveBeenCalledTimes(1);

		rerender(<GameWatchers uids={[]} usersByUid={USERS} loading error={null} onReload={onReload} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
		});
		expect(onReload).toHaveBeenCalledTimes(1);
	});

	it('links each follower to their record', () => {
		renderWatchers({ uids: ['anna'] });

		expect(within(screen.getByRole('list')).getByRole('link', { name: /Anna/ })).toHaveAttribute('href', '/u/anna');
	});
});
