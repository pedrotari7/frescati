import { CheckBadgeIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { GameResponse } from '@shared/types';
import type { GameLifecycle } from '@shared/game';
import { getExtraSpot } from '@shared/game';
import { classNames } from '../lib/utils/reactHelper';

/**
 * What an extra is told about their own spot, under the buttons they tapped.
 *
 * An extra's In is the one answer in the app that does nothing on its own: the
 * headcount is `membersIn + extrasConfirmed`, so tapping it moves no number on
 * any screen until a season admin says so. Every other answer is its own
 * receipt, the button fills in, the count goes up, and this one used to be
 * explained by a permanent grey line that said the same thing before and after
 * they answered, with the actual state hidden in a pill beside their name on a
 * roster they had to go and find.
 *
 * So the note follows the state rather than the screen. It is the same
 * component on the season's home card and on the game page, because the tap
 * happens on both and the answer to "did that work?" has to be in the place it
 * was asked.
 *
 * The decision comes off the response, never off `isExtra`: `role` is
 * snapshotted when the response is written and is what the headcount tallies,
 * so somebody added to the squad after answering is genuinely still queued as
 * an extra on this game, and hiding the note would leave them waiting on
 * nothing with no way of knowing. `isExtra` is only for the case where there is
 * no document to read a role from, the explanation of what tapping In will do.
 */
const ExtraSpotNote = ({
	isExtra,
	myResponse,
	lifecycle,
}: {
	/** Whether the person looking is outside the season's squad. */
	isExtra: boolean;
	myResponse: GameResponse | undefined;
	lifecycle: GameLifecycle;
}) => {
	const spot = getExtraSpot(myResponse);

	if (spot) {
		const pending = spot === 'pending';
		const Icon = pending ? ClockIcon : CheckBadgeIcon;

		// The strip the compact kit warning draws, on purpose: the icon carries
		// the colour and the words stay legible against the tint, and this card
		// already speaks that language a few pixels further up.
		return (
			<div
				className={classNames(
					'mt-3 flex items-start gap-2.5 rounded-2xl border px-3 py-2.5',
					pending ? 'border-pending/25 bg-pending/8' : 'border-in/25 bg-in/8'
				)}
			>
				<Icon
					className={classNames('mt-0.5 size-4 shrink-0', pending ? 'text-pending' : 'text-in')}
					aria-hidden='true'
				/>

				<p className='min-w-0 flex-1 text-xs'>
					<span className='text-ink font-semibold'>{pending ? 'Waiting on a spot.' : "You're in."}</span>
					<span className='text-faint'>
						{pending
							? " You're down as an extra, an admin confirms your spot before you count towards the headcount."
							: ' An admin confirmed your spot, so you count towards the headcount.'}
					</span>
				</p>
			</div>
		);
	}

	// Nothing to report yet, so this says what will happen rather than what did.
	// Only while the game can still be answered: past the deadline, telling
	// somebody how the queue works is describing a queue they can no longer join.
	if (!isExtra || lifecycle !== 'open') return null;

	return (
		<p className='text-extra mt-3 text-center text-xs'>
			You&apos;re not in the squad for this season, so you&apos;ll be listed as an extra, an admin confirms your
			spot before you count towards the headcount.
		</p>
	);
};

export default ExtraSpotNote;
