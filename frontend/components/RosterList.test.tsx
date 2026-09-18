import * as stylex from '@stylexjs/stylex';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, GameResponse } from '@shared/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import { stylesFor, stylesOf } from '../test/stylex';
import RosterList, { buildRoster } from './RosterList';
import { ConfirmProvider } from './ConfirmDialog';

/* A name struck through is somebody who said In and then did not turn up. */
const expected = stylex.create({ struck: { textDecorationLine: 'line-through' } });

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

// Reporting a no-show asks first, so the tests about it run inside the real
// dialog rather than the context's default, which answers yes to everything and
// would let the asking quietly disappear. See `ScoreboardLock.test.tsx`, which
// makes the same trade for the same reason.
const tapNoShow = async () => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'No-show' }));
	});
};

const answerDialog = async (name: 'Mark as a no-show' | 'Cancel') => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

const tap = async (name: string | RegExp) => {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
};

/* An admin answering for somebody: the pencil on their row, then the sheet. */
const openTheAnswer = async (displayName: string) => {
	await tap(`Answer for ${displayName}`);
};

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

	// Two labels that are open questions right up to kick-off and neither
	// afterwards: nobody is going to answer now, and nobody is going to be
	// given a spot.
	it('closes the two open questions once the game has been played', () => {
		render(
			<RosterList
				memberUids={['alice', 'carol']}
				responses={[
					response({ uid: 'alice', status: 'in', role: 'member' }),
					response({ uid: 'dave', status: 'in', role: 'extra' }),
				]}
				usersByUid={usersByUid}
				played
			/>
		);

		expect(screen.getByText('Never answered')).toBeInTheDocument();
		expect(screen.queryByText('Yet to answer')).not.toBeInTheDocument();
		expect(screen.getByText('No spot')).toBeInTheDocument();
		expect(screen.queryByText('Awaiting a spot')).not.toBeInTheDocument();
	});

	it('lets an admin give an unconfirmed extra a spot', async () => {
		const onToggleExtra = vi.fn().mockResolvedValue(undefined);

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

		expect(screen.getByText("Didn't show")).toBeInTheDocument();
		expect(screen.getByText('No-show')).toBeInTheDocument();
		expect(stylesOf(screen.getByText('Bob Lee'))).toEqual(expect.arrayContaining(stylesFor(expected.struck)));
		expect(stylesOf(screen.getByText('Alice Ng'))).not.toEqual(expect.arrayContaining(stylesFor(expected.struck)));
	});

	// Before kick-off there is nothing anybody could know, which is what
	// `canReportAbsence` decides on the page.
	it('offers no way to report one until the caller says it is time', () => {
		render(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
				usersByUid={usersByUid}
				onToggleAbsent={vi.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: 'No-show' })).not.toBeInTheDocument();
	});

	it('lets an admin report a no-show, and take it back', async () => {
		const onToggleAbsent = vi.fn().mockResolvedValue(undefined);

		const { rerender } = render(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
					usersByUid={usersByUid}
					canReportAbsence
					onToggleAbsent={onToggleAbsent}
				/>
			</ConfirmProvider>
		);

		await tapNoShow();
		await answerDialog('Mark as a no-show');

		expect(onToggleAbsent).toHaveBeenCalledWith('alice', true);

		rerender(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'in', role: 'member', absent: true })]}
					usersByUid={usersByUid}
					canReportAbsence
					onToggleAbsent={onToggleAbsent}
				/>
			</ConfirmProvider>
		);

		// Taking one back is nobody's regret, so it stays a single tap.
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		});

		expect(onToggleAbsent).toHaveBeenLastCalledWith('alice', false);
	});

	// The whole reason the dialog exists: this button sits at the end of every
	// row in the squad, and a mistap used to be an accusation.
	it('writes nothing until the dialog agrees, and names who it is about', async () => {
		const onToggleAbsent = vi.fn().mockResolvedValue(undefined);

		render(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
					usersByUid={usersByUid}
					canReportAbsence
					onToggleAbsent={onToggleAbsent}
				/>
			</ConfirmProvider>
		);

		await tapNoShow();

		expect(onToggleAbsent).not.toHaveBeenCalled();
		expect(screen.getByText('Mark Alice Ng as a no-show?')).toBeInTheDocument();

		await answerDialog('Cancel');

		expect(onToggleAbsent).not.toHaveBeenCalled();
	});

	// Past kick-off the row asks one question rather than showing two buttons in
	// the width of a phone, for a confirmed extra, whether they turned up.
	it('replaces the extras controls with the no-show one once the game is on', async () => {
		const onToggleAbsent = vi.fn().mockResolvedValue(undefined);

		render(
			<ConfirmProvider>
				<RosterList
					memberUids={[]}
					responses={[response({ uid: 'carol', status: 'in', role: 'extra', confirmOverride: true })]}
					usersByUid={usersByUid}
					canManageExtras
					canReportAbsence
					onToggleExtra={vi.fn()}
					onToggleAbsent={onToggleAbsent}
				/>
			</ConfirmProvider>
		);

		expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();

		await tapNoShow();
		await answerDialog('Mark as a no-show');

		expect(onToggleAbsent).toHaveBeenCalledWith('carol', true);
	});

	// Somebody who never held a spot cannot have failed to use it, so past
	// kick-off the question about them is still whether they get one, which is
	// also what tells them apart from a confirmed extra on a screen an admin is
	// counting heads from.
	it('keeps offering a spot to an unconfirmed extra once the game is on', async () => {
		const onToggleExtra = vi.fn().mockResolvedValue(undefined);

		render(
			<RosterList
				memberUids={[]}
				responses={[response({ uid: 'carol', status: 'in', role: 'extra' })]}
				usersByUid={usersByUid}
				canManageExtras
				canReportAbsence
				onToggleExtra={onToggleExtra}
				onToggleAbsent={vi.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: 'No-show' })).not.toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Give a spot' }));
		});

		expect(onToggleExtra).toHaveBeenCalledWith('carol', true);
	});

	it('lets an admin drop an already-confirmed extra', async () => {
		const onToggleExtra = vi.fn().mockResolvedValue(undefined);

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
	it('offers an admin no way to nudge without a handler', () => {
		render(<RosterList memberUids={['carol']} responses={[]} usersByUid={usersByUid} />);

		expect(screen.getByText('Yet to answer')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Nudge' })).not.toBeInTheDocument();
	});

	it('lets an admin ask somebody who has not answered', async () => {
		const onNudge = vi.fn().mockResolvedValue(true);

		render(<RosterList memberUids={['carol']} responses={[]} usersByUid={usersByUid} onNudge={onNudge} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Nudge' }));
		});

		expect(onNudge).toHaveBeenCalledWith('carol');
	});

	// Nothing anywhere records that somebody was nudged, so the button's own
	// memory of it is the whole of the record. It is there to stop the same
	// thumb on the same row twice, wondering whether the first one worked.
	it('stops offering the same person a second time once one has landed', async () => {
		render(
			<RosterList
				memberUids={['carol']}
				responses={[]}
				usersByUid={usersByUid}
				onNudge={vi.fn().mockResolvedValue(true)}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Nudge' }));
		});

		expect(screen.queryByRole('button', { name: 'Nudge' })).not.toBeInTheDocument();
		expect(screen.getByText('Nudged')).toBeInTheDocument();
	});

	// A send that failed has been toasted by the caller, and the row must not
	// also claim it happened: the only way to try again is this button.
	it('keeps the button when the send did not land', async () => {
		render(
			<RosterList
				memberUids={['carol']}
				responses={[]}
				usersByUid={usersByUid}
				onNudge={vi.fn().mockResolvedValue(false)}
			/>
		);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Nudge' }));
		});

		expect(screen.getByRole('button', { name: 'Nudge' })).toBeInTheDocument();
		expect(screen.queryByText('Nudged')).not.toBeInTheDocument();
	});

	// The people in every other group have already said something. Asking them
	// again is asking a question they have answered.
	it("offers an admin no way into somebody else's answer without a handler", () => {
		render(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
				usersByUid={usersByUid}
			/>
		);

		expect(screen.queryByRole('button', { name: /^Answer for/ })).not.toBeInTheDocument();
	});

	// The groups already end in controls of their own, so this one is an icon and
	// its label is the only thing naming who the row is about.
	it('puts one on every row it offers, naming the person', async () => {
		render(
			<RosterList
				memberUids={['alice', 'bob', 'carol']}
				responses={[
					response({ uid: 'alice', status: 'in', role: 'member' }),
					response({ uid: 'bob', status: 'out', role: 'member' }),
					response({ uid: 'dave', status: 'in', role: 'extra', confirmOverride: true }),
				]}
				usersByUid={usersByUid}
				onSetAnswer={vi.fn().mockResolvedValue(undefined)}
			/>
		);

		expect(screen.getAllByRole('button', { name: /^Answer for/ })).toHaveLength(4);
		expect(screen.getByRole('button', { name: 'Answer for Carol Diaz' })).toBeInTheDocument();
	});

	// The mark exists to say they said In and did not turn up, so rewriting what
	// they said is the one thing it must not offer.
	it('leaves the no-shows alone', () => {
		render(
			<RosterList
				memberUids={['alice']}
				responses={[response({ uid: 'alice', status: 'in', role: 'member', absent: true })]}
				usersByUid={usersByUid}
				onSetAnswer={vi.fn().mockResolvedValue(undefined)}
			/>
		);

		expect(screen.getByText("Didn't show")).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /^Answer for/ })).not.toBeInTheDocument();
	});

	it('reads the answer they hold now off the response rather than the row', async () => {
		render(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
					usersByUid={usersByUid}
					onSetAnswer={vi.fn().mockResolvedValue(undefined)}
				/>
			</ConfirmProvider>
		);

		await openTheAnswer('Alice Ng');

		expect(screen.getByText('Answer for Alice Ng')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /They're in/ })).toBeDisabled();
	});

	// The whole reason the dialog is here: this writes an answer in somebody
	// else's name, on a screen an admin is thumbing through.
	it('writes nothing until the dialog agrees, and says what it will do', async () => {
		const onSetAnswer = vi.fn().mockResolvedValue(undefined);

		render(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'in', role: 'member' })]}
					usersByUid={usersByUid}
					onSetAnswer={onSetAnswer}
				/>
			</ConfirmProvider>
		);

		await openTheAnswer('Alice Ng');
		await tap(/They're out/);

		expect(onSetAnswer).not.toHaveBeenCalled();
		expect(screen.getByText('Say Alice Ng is out?')).toBeInTheDocument();

		await tap('Cancel');

		expect(onSetAnswer).not.toHaveBeenCalled();
	});

	it('answers for them once it has agreed', async () => {
		const onSetAnswer = vi.fn().mockResolvedValue(undefined);

		render(
			<ConfirmProvider>
				<RosterList memberUids={['alice']} responses={[]} usersByUid={usersByUid} onSetAnswer={onSetAnswer} />
			</ConfirmProvider>
		);

		await openTheAnswer('Alice Ng');
		await tap(/They're in/);
		await tap('Say they are in');

		expect(onSetAnswer).toHaveBeenCalledWith('alice', 'in');
	});

	// `null` rather than a third status: the absence of the document is the real
	// "no response", so putting somebody back into it is a delete.
	it('takes an answer back to no answer at all', async () => {
		const onSetAnswer = vi.fn().mockResolvedValue(undefined);

		render(
			<ConfirmProvider>
				<RosterList
					memberUids={['alice']}
					responses={[response({ uid: 'alice', status: 'out', role: 'member' })]}
					usersByUid={usersByUid}
					onSetAnswer={onSetAnswer}
				/>
			</ConfirmProvider>
		);

		await openTheAnswer('Alice Ng');
		await tap('Back to no answer');
		await tap('Take it back');

		expect(onSetAnswer).toHaveBeenCalledWith('alice', null);
	});

	it('offers it only to the people who have not answered', () => {
		render(
			<RosterList
				memberUids={['alice', 'bob', 'carol']}
				responses={[
					response({ uid: 'alice', status: 'in', role: 'member' }),
					response({ uid: 'bob', status: 'out', role: 'member' }),
				]}
				usersByUid={usersByUid}
				onNudge={vi.fn().mockResolvedValue(true)}
			/>
		);

		expect(screen.getAllByRole('button', { name: 'Nudge' })).toHaveLength(1);
	});
});
