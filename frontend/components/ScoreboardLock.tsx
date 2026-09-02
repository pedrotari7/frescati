'use client';

import { LockClosedIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import Button from './Button';
import { useConfirm } from './ConfirmDialog';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	correcting: {
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.pending25,
		backgroundColor: tint.pending8,
		marginBottom: 12,
		borderRadius: 16,
		padding: 12,
	},
	head: { display: 'flex', alignItems: 'center', gap: 8 },
	headIcon: { color: colors.pending, width: 16, height: 16, flexShrink: 0 },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	body: { color: colors.muted, marginTop: 8, fontSize: 12, lineHeight: 1.625 },
	action: { marginTop: 12 },

	locked: { marginBottom: 12 },
	lockedLine: {
		color: colors.faint,
		display: 'flex',
		alignItems: 'flex-start',
		gap: 6,
		fontSize: 12,
		lineHeight: 1.625,
	},
	lockIcon: { marginTop: 2, width: 14, height: 14, flexShrink: 0 },
	buttonIcon: { width: 16, height: 16 },
});

/**
 * The way in and out of a confirmed game's scoreboard.
 *
 * Every other score in the app is one tap, deliberately: whoever has a free
 * hand and a signal enters it, and a wrong one is one tap back. A confirmed
 * game is the exception, because by then the ratings have been applied, so the
 * same tap asks `replayRatingsFrom` to rewind the ledger and rate every game
 * since against a table that has moved. Nothing on the screen says that is
 * about to happen, and nothing undoes it: the way back is to put the score
 * right and let the ladder be worked out a third time.
 *
 * An admin opens a confirmed game to read it far more often than to change it:
 * the table, the ratings, who was man of the match, and on a phone that means
 * scrolling a column of steppers with a thumb. So the steppers stay dead until
 * this says otherwise, and this asks first. The one thing it must not do is
 * make a correction feel discouraged: it is the only way a wrong score is ever
 * put right, and the button says so plainly rather than in red.
 *
 * The unlock is state on the screen rather than on the game. It is about this
 * visit, coming back to a locked scoreboard is the right default, not an
 * inconvenience, and there is nothing for a second person to see.
 */
const ScoreboardLock = ({ correcting, onChange }: { correcting: boolean; onChange: (next: boolean) => void }) => {
	const confirm = useConfirm();

	if (correcting) {
		return (
			<div {...stylex.props(styles.correcting)}>
				<div {...stylex.props(styles.head)}>
					<PencilSquareIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
					<h3 {...stylex.props(styles.title)}>Correcting a confirmed score</h3>
				</div>

				<p {...stylex.props(styles.body)}>
					Every change from here works the ratings out again: this game, and every game played since.
				</p>

				<Button size='sm' variant='secondary' sx={styles.action} onClick={() => onChange(false)}>
					Done
				</Button>
			</div>
		);
	}

	return (
		<div {...stylex.props(styles.locked)}>
			<p {...stylex.props(styles.lockedLine)}>
				<LockClosedIcon {...stylex.props(styles.lockIcon)} aria-hidden='true' />
				<span>The game is confirmed, so the score is settled. It can still be put right.</span>
			</p>

			<Button
				size='sm'
				variant='secondary'
				sx={styles.action}
				onClick={async () => {
					const ok = await confirm({
						title: 'Correct a confirmed score?',
						message:
							'The ratings for this game have already been applied. Changing a score now works them out again: for this game, and for every game played since.',
						confirmLabel: 'Correct it',
					});

					if (ok) onChange(true);
				}}
			>
				<PencilSquareIcon {...stylex.props(styles.buttonIcon)} aria-hidden='true' />
				Correct a score
			</Button>
		</div>
	);
};

export default ScoreboardLock;
