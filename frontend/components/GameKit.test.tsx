import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import type { AppUser, GameResponse, KitItem, KitKind } from '@shared/types';
import { tint } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import GameKit from './GameKit';

/* The two edges the strip is drawn with: something is missing, or nobody has said. */
const expected = stylex.create({
	severe: { borderColor: tint.out30 },
	unconfirmed: { borderColor: tint.pending25 },
});

const user = (uid: string, displayName: string) => [uid, { uid, displayName, photoURL: null } as AppUser] as const;

const usersByUid = new Map<string, AppUser>([user('anna', 'Anna Lindqvist'), user('pedro', 'Pedro Alvito')]);

const item = (id: string, kind: KitKind, holderUid: string, name = id): KitItem => ({
	id,
	name,
	kind,
	holderUid,
	updatedBy: holderUid,
	updatedAt: '2026-08-01T00:00:00.000Z',
});

const answer = (uid: string, status: 'in' | 'out'): Pick<GameResponse, 'uid' | 'status'> => ({ uid, status });

const draw = (items: KitItem[], responses: Pick<GameResponse, 'uid' | 'status'>[], props: { compact?: boolean } = {}) =>
	render(<GameKit seasonId='season-1' items={items} responses={responses} usersByUid={usersByUid} {...props} />);

describe('GameKit', () => {
	it('names who is bringing each kind', () => {
		draw([item('ball-1', 'ball', 'anna', 'Match ball')], [answer('anna', 'in')]);

		expect(screen.getByText('Ball')).toBeInTheDocument();
		expect(screen.getByText('Coming')).toBeInTheDocument();
		expect(screen.getByText('Anna Lindqvist')).toBeInTheDocument();
	});

	// The row already says which kind it is, so the pill only has to say what is
	// happening to it.
	it('says who has it and that they are out when nothing is coming', () => {
		draw([item('vests-1', 'vests', 'pedro', 'Blue vests')], [answer('pedro', 'out')]);

		expect(screen.getByText('Not coming')).toBeInTheDocument();
		expect(screen.getByText("Pedro Alvito has it and isn't playing")).toBeInTheDocument();
	});

	it('tells an outstanding answer apart from a no', () => {
		draw([item('ball-1', 'ball', 'anna')], []);

		expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
		expect(screen.getByText("Anna Lindqvist has it and hasn't answered")).toBeInTheDocument();
	});

	it('agrees in number when several items of a kind are held', () => {
		draw(
			[item('ball-1', 'ball', 'anna'), item('ball-2', 'ball', 'pedro')],
			[answer('anna', 'out'), answer('pedro', 'out')]
		);

		expect(screen.getByText("Anna Lindqvist, Pedro Alvito have them and aren't playing")).toBeInTheDocument();
	});

	// A blank where a name should be is the least useful thing this line could
	// say, and a holder who has left is exactly why a kind is uncovered.
	it('names a holder who has left the squad rather than leaving a gap', () => {
		draw([item('ball-1', 'ball', 'gone')], [answer('anna', 'in')]);

		expect(screen.getByText(/somebody who has left the squad/)).toBeInTheDocument();
	});

	it('never calls other kit missing', () => {
		draw([item('pump', 'other', 'pedro', 'Pump')], [answer('pedro', 'out')]);

		expect(screen.getByText('Other kit')).toBeInTheDocument();
		expect(screen.getByText('Not coming')).toBeInTheDocument();
		expect(screen.queryByText(/^No /)).not.toBeInTheDocument();
	});

	it('draws nothing for a season with an empty register', () => {
		const { container } = draw([], [answer('anna', 'in')]);

		expect(container).toBeEmptyDOMElement();
	});

	describe('on the next-game card', () => {
		// The card most people ever look at. A green tick confirming the ball
		// exists is not what they opened the app for.
		it('stays silent when everything required is covered', () => {
			const { container } = draw(
				[item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'anna')],
				[answer('anna', 'in')],
				{ compact: true }
			);

			expect(container).toBeEmptyDOMElement();
		});

		it('speaks up, and links to the register, when something is missing', () => {
			draw([item('vests-1', 'vests', 'pedro')], [answer('pedro', 'out')], { compact: true });

			expect(screen.getByText('No vests')).toBeInTheDocument();
			expect(screen.getByRole('link')).toHaveAttribute('href', '/s/season-1/kit');
		});

		// Nothing else on this strip names the kind, so the headline has to.
		// "Nobody confirmed" said a thing was wrong without saying which thing.
		it('names the kind when it is only unconfirmed, not just when it is missing', () => {
			draw([item('ball-1', 'ball', 'anna', 'Match ball')], [], { compact: true });

			expect(screen.getByText('Ball unconfirmed')).toBeInTheDocument();
			expect(screen.queryByText('Nobody confirmed')).not.toBeInTheDocument();
		});

		it('mentions every required kind that is short, and no others', () => {
			draw(
				[item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'pedro'), item('pump', 'other', 'pedro')],
				[answer('anna', 'out'), answer('pedro', 'out')],
				{ compact: true }
			);

			expect(screen.getByText('No ball')).toBeInTheDocument();
			expect(screen.getByText('No vests')).toBeInTheDocument();
			expect(screen.queryByText(/Pump|Other kit/)).not.toBeInTheDocument();
		});

		// A missing ball and unconfirmed vests are not the same situation, and a
		// strip that painted both the same amber said they were.
		it('goes red for something genuinely missing and amber for merely unconfirmed', () => {
			const { container: unconfirmed } = draw([item('ball-1', 'ball', 'anna')], [], { compact: true });
			expect(stylesOf(unconfirmed.querySelector('a'))).toEqual(
				expect.arrayContaining(stylesFor(expected.unconfirmed))
			);

			const { container: severe } = draw([item('ball-1', 'ball', 'anna')], [answer('anna', 'out')], {
				compact: true,
			});
			expect(stylesOf(severe.querySelector('a'))).toEqual(expect.arrayContaining(stylesFor(expected.severe)));
		});

		it('takes the worse of two gaps for its colour', () => {
			const { container } = draw(
				[item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'pedro')],
				[answer('anna', 'out')],
				{ compact: true }
			);

			expect(stylesOf(container.querySelector('a'))).toEqual(expect.arrayContaining(stylesFor(expected.severe)));
		});
	});
});
