import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, GameResponse } from '@shared/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import RosterList, { buildRoster } from './RosterList';

const user = (uid: string, displayName: string): AppUser => ({
	uid,
	displayName,
	photoURL: null,
	createdAt: '2026-01-01T00:00:00.000Z',
	lastSeenAt: '2026-01-01T00:00:00.000Z',
	isAppAdmin: false,
	notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
});

const response = (overrides: Partial<GameResponse> & Pick<GameResponse, 'uid' | 'status' | 'role'>): GameResponse => ({
	respondedAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	...overrides,
});

const usersByUid = new Map([
	['alice', user('alice', 'Alice Ng')],
	['bob', user('bob', 'Bob Lee')],
	['carol', user('carol', 'Carol Diaz')],
	['dave', user('dave', 'Dave Kim')],
]);

describe('buildRoster', () => {
	it('sorts members into playing, out and awaiting', () => {
		const roster = buildRoster(
			['alice', 'bob', 'carol'],
			[
				response({ uid: 'alice', status: 'in', role: 'member' }),
				response({ uid: 'bob', status: 'out', role: 'member' }),
			],
			usersByUid
		);

		expect(roster.playing.map(entry => entry.uid)).toEqual(['alice']);
		expect(roster.out.map(entry => entry.uid)).toEqual(['bob']);
		expect(roster.awaiting.map(entry => entry.uid)).toEqual(['carol']);
	});

	it('falls back to a placeholder for a uid missing from the user map', () => {
		const roster = buildRoster(['ghost'], [], usersByUid);

		expect(roster.awaiting).toEqual([
			{ uid: 'ghost', displayName: 'Unknown player', photoURL: null, response: undefined },
		]);
	});

	it('lists only extras who are in, dropping extras who are out entirely', () => {
		const roster = buildRoster(
			[],
			[
				response({ uid: 'carol', status: 'in', role: 'extra' }),
				response({ uid: 'dave', status: 'out', role: 'extra' }),
			],
			usersByUid
		);

		expect(roster.extras.map(entry => entry.uid)).toEqual(['carol']);
	});

	it('keeps a member response out of the extras section', () => {
		const roster = buildRoster(['alice'], [response({ uid: 'alice', status: 'in', role: 'member' })], usersByUid);

		expect(roster.extras).toEqual([]);
		expect(roster.playing.map(entry => entry.uid)).toEqual(['alice']);
	});

	// Out of the group they answered into and into one of its own: left among
	// the people who turned up, a no-show reads as a footnote.
	it('lifts a no-show out of the squad and the extras alike, members first', () => {
		const roster = buildRoster(
			['alice', 'bob'],
			[
				response({ uid: 'alice', status: 'in', role: 'member' }),
				response({ uid: 'bob', status: 'in', role: 'member', absent: true }),
				response({ uid: 'carol', status: 'in', role: 'extra', confirmOverride: true, absent: true }),
				response({ uid: 'dave', status: 'in', role: 'extra', confirmOverride: true }),
			],
			usersByUid
		);

		expect(roster.playing.map(entry => entry.uid)).toEqual(['alice']);
		expect(roster.extras.map(entry => entry.uid)).toEqual(['dave']);
		expect(roster.absent.map(entry => entry.uid)).toEqual(['bob', 'carol']);
	});

	it('leaves a stale mark on somebody who has since said out where it found them', () => {
		const roster = buildRoster(
			['alice'],
			[response({ uid: 'alice', status: 'out', role: 'member', absent: true })],
			usersByUid
		);

		expect(roster.absent).toEqual([]);
		expect(roster.out.map(entry => entry.uid)).toEqual(['alice']);
	});
});

describe('RosterList', () => {
	it('renders each non-empty section with its count', () => {
		render(
			<RosterList
				memberUids={['alice', 'bob', 'carol']}
				responses={[
					response({ uid: 'alice', status: 'in', role: 'member' }),
					response({ uid: 'bob', status: 'out', role: 'member' }),
				]}
				usersByUid={usersByUid}
			/>
		);

		expect(screen.getByText('Squad in')).toBeInTheDocument();
		expect(screen.getByText('Alice Ng')).toBeInTheDocument();
		expect(screen.getByText('Yet to answer')).toBeInTheDocument();
		expect(screen.getByText('Carol Diaz')).toBeInTheDocument();
		expect(screen.getByText('Out')).toBeInTheDocument();
		expect(screen.getByText('Bob Lee')).toBeInTheDocument();
	});

	it('omits a section entirely when it has no entries', () => {
		render(<RosterList memberUids={['alice']} responses={[]} usersByUid={usersByUid} />);

		expect(screen.queryByText('Squad in')).not.toBeInTheDocument();
		expect(screen.queryByText('Out')).not.toBeInTheDocument();
		expect(screen.getByText('Yet to answer')).toBeInTheDocument();
	});

	it('shows a read-only pill for an unconfirmed extra when the caller cannot manage extras', () => {
		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra' })]}
				usersByUid={usersByUid}
			/>
		);

		expect(screen.getByText('Awaiting a spot')).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('lets an admin give an unconfirmed extra a spot', async () => {
		const onToggleExtra = jest.fn().mockResolvedValue(undefined);

		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra' })]}
				usersByUid={usersByUid}
				canManageExtras
				onToggleExtra={onToggleExtra}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Give a spot' }));
		});

		expect(onToggleExtra).toHaveBeenCalledWith('carol', true);
	});

	it('names the no-shows in a section of their own', () => {
		render(
			<RosterList
				memberUids={['alice', 'bob']}
				responses={[
					response({ uid: 'alice', status: 'in', role: 'member' }),
					response({ uid: 'bob', status: 'in', role: 'member', absent: true }),
				]}
				usersByUid={usersByUid}
			/>
		);

		expect(screen.getByText('Didn’t show')).toBeInTheDocument();
		expect(screen.getByText('No-show')).toBeInTheDocument();
		expect(screen.getByText('Bob Lee')).toHaveClass('line-through');
		expect(screen.getByText('Alice Ng')).not.toHaveClass('line-through');
	});

	// Before kick-off there is nothing anybody could know, which is what
	// `canReportAbsence` decides on the page.
	it('offers no way to report one until the caller says it is time', () => {
		render(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
				usersByUid={usersByUid}
				onToggleAbsent={jest.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: 'No-show' })).not.toBeInTheDocument();
	});

	it('lets an admin report a no-show, and take it back', async () => {
		const onToggleAbsent = jest.fn().mockResolvedValue(undefined);

		const { rerender } = render(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
				usersByUid={usersByUid}
				canReportAbsence
				onToggleAbsent={onToggleAbsent}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'No-show' }));
		});

		expect(onToggleAbsent).toHaveBeenCalledWith('alice', true);

		rerender(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member', absent: true })]}
				usersByUid={usersByUid}
				canReportAbsence
				onToggleAbsent={onToggleAbsent}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		});

		expect(onToggleAbsent).toHaveBeenLastCalledWith('alice', false);
	});

	// Past kick-off the row asks one question rather than showing two buttons in
	// the width of a phone — for a confirmed extra, whether they turned up.
	it('replaces the extras controls with the no-show one once the game is on', async () => {
		const onToggleAbsent = jest.fn().mockResolvedValue(undefined);

		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra', confirmOverride: true })]}
				usersByUid={usersByUid}
				canManageExtras
				canReportAbsence
				onToggleExtra={jest.fn()}
				onToggleAbsent={onToggleAbsent}
			/>
		);

		expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'No-show' }));
		});

		expect(onToggleAbsent).toHaveBeenCalledWith('carol', true);
	});

	// Somebody who never held a spot cannot have failed to use it, so past
	// kick-off the question about them is still whether they get one — which is
	// also what tells them apart from a confirmed extra on a screen an admin is
	// counting heads from.
	it('keeps offering a spot to an unconfirmed extra once the game is on', async () => {
		const onToggleExtra = jest.fn().mockResolvedValue(undefined);

		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra' })]}
				usersByUid={usersByUid}
				canManageExtras
				canReportAbsence
				onToggleExtra={onToggleExtra}
				onToggleAbsent={jest.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: 'No-show' })).not.toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Give a spot' }));
		});

		expect(onToggleExtra).toHaveBeenCalledWith('carol', true);
	});

	it('lets an admin drop an already-confirmed extra', async () => {
		const onToggleExtra = jest.fn().mockResolvedValue(undefined);

		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra', confirmOverride: true })]}
				usersByUid={usersByUid}
				canManageExtras
				onToggleExtra={onToggleExtra}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Drop' }));
		});

		expect(onToggleExtra).toHaveBeenCalledWith('carol', false);
	});
});
