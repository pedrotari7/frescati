'use client';

import { LockClosedIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import Button from './Button';
import { useConfirm } from './ConfirmDialog';

/**
 * The way in and out of a confirmed game's scoreboard.
 *
 * Every other score in the app is one tap, deliberately: whoever has a free
 * hand and a signal enters it, and a wrong one is one tap back. A confirmed
 * game is the exception, because by then the ratings have been applied — so the
 * same tap asks `replayRatingsFrom` to rewind the ledger and rate every game
 * since against a table that has moved. Nothing on the screen says that is
 * about to happen, and nothing undoes it: the way back is to put the score
 * right and let the ladder be worked out a third time.
 *
 * An admin opens a confirmed game to read it far more often than to change it —
 * the table, the ratings, who was man of the match — and on a phone that means
 * scrolling a column of steppers with a thumb. So the steppers stay dead until
 * this says otherwise, and this asks first. The one thing it must not do is
 * make a correction feel discouraged: it is the only way a wrong score is ever
 * put right, and the button says so plainly rather than in red.
 *
 * The unlock is state on the screen rather than on the game. It is about this
 * visit — coming back to a locked scoreboard is the right default, not an
 * inconvenience — and there is nothing for a second person to see.
 */
const ScoreboardLock = ({ correcting, onChange }: { correcting: boolean; onChange: (next: boolean) => void }) => {
	const confirm = useConfirm();

	if (correcting) {
		return (
			<div className='border-pending/25 bg-pending/8 mb-3 rounded-2xl border p-3'>
				<div className='flex items-center gap-2'>
					<PencilSquareIcon className='text-pending size-4 shrink-0' aria-hidden='true' />
					<h3 className='text-ink text-sm font-semibold'>Correcting a confirmed score</h3>
				</div>

				<p className='text-muted mt-2 text-xs leading-relaxed'>
					Every change from here works the ratings out again — this game, and every game played since.
				</p>

				<Button size='sm' variant='secondary' className='mt-3' onClick={() => onChange(false)}>
					Done
				</Button>
			</div>
		);
	}

	return (
		<div className='mb-3'>
			<p className='text-faint flex items-start gap-1.5 text-xs leading-relaxed'>
				<LockClosedIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
				<span>The game is confirmed, so the score is settled. It can still be put right.</span>
			</p>

			<Button
				size='sm'
				variant='secondary'
				className='mt-3'
				onClick={async () => {
					const ok = await confirm({
						title: 'Correct a confirmed score?',
						message:
							'The ratings for this game have already been applied. Changing a score now works them out again — for this game, and for every game played since.',
						confirmLabel: 'Correct it',
					});

					if (ok) onChange(true);
				}}
			>
				<PencilSquareIcon className='size-4' aria-hidden='true' />
				Correct a score
			</Button>
		</div>
	);
};

export default ScoreboardLock;
