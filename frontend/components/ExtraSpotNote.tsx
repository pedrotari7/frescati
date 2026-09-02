import { CheckBadgeIcon, ClockIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { GameResponse } from '@shared/types';
import type { GameLifecycle } from '@shared/game';
import { getExtraSpot } from '@shared/game';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	strip: {
		marginTop: 12,
		display: 'flex',
		alignItems: 'flex-start',
		gap: 10,
		borderRadius: 16,
		borderWidth: 1,
		borderStyle: 'solid',
		paddingInline: 12,
		paddingBlock: 10,
	},
	waiting: { borderColor: tint.pending25, backgroundColor: tint.pending8 },
	confirmed: { borderColor: tint.in25, backgroundColor: tint.in8 },

	icon: { marginTop: 2, width: 16, height: 16, flexShrink: 0 },
	iconWaiting: { color: colors.pending },
	iconConfirmed: { color: colors.in },

	text: { minWidth: 0, flexGrow: 1, fontSize: 12, lineHeight: '16px' },
	lead: { color: colors.ink, fontWeight: 600 },
	rest: { color: colors.faint },

	note: { color: colors.extra, marginTop: 12, textAlign: 'center', fontSize: 12, lineHeight: '16px' },
});

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
			<div {...stylex.props(styles.strip, pending ? styles.waiting : styles.confirmed)}>
				<Icon
					{...stylex.props(styles.icon, pending ? styles.iconWaiting : styles.iconConfirmed)}
					aria-hidden='true'
				/>

				<p {...stylex.props(styles.text)}>
					<span {...stylex.props(styles.lead)}>{pending ? 'Waiting on a spot.' : "You're in."}</span>
					<span {...stylex.props(styles.rest)}>
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
		<p {...stylex.props(styles.note)}>
			You&apos;re not in the squad for this season, so you&apos;ll be listed as an extra, an admin confirms your
			spot before you count towards the headcount.
		</p>
	);
};

export default ExtraSpotNote;
