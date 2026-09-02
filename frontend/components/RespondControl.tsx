'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircleIcon, CheckIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/solid';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { GameResponse, ResponseStatus } from '@shared/types';
import { getExtraSpot } from '@shared/game';
import { formatSek } from '@shared/format';
import { bp, colors, shadows, tint } from '../app/tokens.stylex';
import { useToast } from './Toast';
import { hapticLight, hapticSuccess } from '../lib/utils/haptics';
import { captureError } from '../lib/sentry';

/**
 * What one half of the pair is to the answer on the document.
 *
 * Three, not two. "Nobody has answered yet" has to look different from "you
 * answered, and this is the one you turned down", and both used to be the same
 * tinted button. That left the pair saying which way you had answered only by
 * comparison with a row that had answered the other way. On the hero card,
 * where one pair is on screen and there is nothing to compare it against, it
 * did not say at all.
 */
type Standing = 'chosen' | 'offered' | 'passedOver';

const halves = stylex.create({
	/**
	 * The half you did not take, drained of its colour. On an answered pair,
	 * colour is what says which one is yours, so only one half may carry any.
	 */
	passedOver: {
		backgroundColor: { default: tint.white5, [bp.hover]: { default: null, ':hover': tint.white10 } },
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		boxShadow: `inset 0 0 0 1px ${tint.white10}`,
	},

	inChosen: { backgroundColor: colors.in, color: colors.canvas, boxShadow: shadows.lift },
	inOffered: {
		backgroundColor: { default: tint.in10, [bp.hover]: { default: null, ':hover': tint.in20 } },
		color: colors.in,
		boxShadow: `inset 0 0 0 1px ${tint.in25}`,
	},

	outChosen: { backgroundColor: colors.out, color: colors.canvas, boxShadow: shadows.lift },
	outOffered: {
		backgroundColor: { default: tint.out10, [bp.hover]: { default: null, ':hover': tint.out20 } },
		color: colors.out,
		boxShadow: `inset 0 0 0 1px ${tint.out25}`,
	},
});

/**
 * How much of the row each half gets. The answer takes more of it, so the pair
 * says which one is yours before you have read a word of either.
 *
 * No wider a split than this. "Can't make it" is thirteen characters, and it is
 * the half giving the width up, so a heavier tilt wraps it onto two lines on a
 * phone.
 */
const widths = stylex.create({
	chosen: { flexGrow: 1.3, flexShrink: 1, flexBasis: '0%' },
	offered: { flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	passedOver: { flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
});

const WIDTHS: Record<Standing, StyleXStyles> = {
	chosen: widths.chosen,
	offered: widths.offered,
	passedOver: widths.passedOver,
};

const OPTIONS: {
	status: ResponseStatus;
	label: string;
	/** What the half says once it is the answer: a state, where the other one is still an action. */
	chosenLabel: string;
	icons: Record<'chosen' | 'other', typeof CheckIcon>;
	styles: Record<Standing, StyleXStyles>;
}[] = [
	{
		status: 'in',
		label: "I'm in",
		chosenLabel: "You're in",
		icons: { chosen: CheckCircleIcon, other: CheckIcon },
		styles: { chosen: halves.inChosen, offered: halves.inOffered, passedOver: halves.passedOver },
	},
	{
		status: 'out',
		label: "Can't make it",
		chosenLabel: "You're out",
		icons: { chosen: XCircleIcon, other: XMarkIcon },
		styles: { chosen: halves.outChosen, offered: halves.outOffered, passedOver: halves.passedOver },
	},
];

const styles = stylex.create({
	root: { width: '100%' },
	pair: { display: 'flex', width: '100%' },
	pairLg: { gap: 12 },
	pairSm: { gap: 8 },

	half: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		fontWeight: 600,
		transitionProperty: 'background-color, color, box-shadow, transform, opacity',
		transitionDuration: '0.15s',
		opacity: { default: null, ':disabled': 0.4 },
		transform: { default: null, ':active': 'scale(0.98)' },
	},
	halfLg: { height: 56, borderRadius: 16, fontSize: 16, lineHeight: '24px' },
	halfSm: { height: 40, borderRadius: 12, paddingInline: 8, fontSize: 14, lineHeight: '20px' },

	iconLg: { width: 20, height: 20 },
	iconSm: { width: 16, height: 16 },

	withdrawRow: { marginTop: 8, display: 'flex', justifyContent: 'center' },
	withdraw: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.muted } },
		borderRadius: 8,
		paddingInline: 12,
		paddingBlock: 6,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 500,
		transitionProperty: 'color',
		transitionDuration: '0.2s',
		opacity: { default: null, ':disabled': 0.4 },
	},

	note: { color: colors.faint, marginTop: 8, textAlign: 'center', fontSize: 12, lineHeight: 1.625 },
	settle: { color: colors.brand, fontWeight: 600 },
});

/**
 * What an unpaid charge does to an In button, passed down from `SeasonProvider`
 * through whichever card is drawing the pair.
 *
 * One object rather than an amount plus a flag, so there is no way to draw the
 * lock without the number that explains it, and `undefined` is the only way to
 * say there is no lock. `firestore.rules` refuses the write either way; this is
 * what stops the refusal arriving as a toast out of nowhere.
 */
export interface DebtLock {
	outstanding: number;
	/** The season's books, where the charge behind the lock is. */
	href: string;
}

/**
 * The In/Out pair. This is the one control the whole app exists for, so on
 * mobile it is deliberately oversized and sits within thumb reach.
 *
 * It is a choice between two answers and not a pair of toggles. Tapping the
 * answer you already gave used to withdraw it, back to no response, which is a
 * real state with real consequences: no headcount, and the reminders start
 * again. Nothing on screen said the second tap would do that, and the half that
 * had been chosen was only a shade brighter than the half that had not, so the
 * gesture that means "check, am I in?" was also the gesture that took you out.
 * Now that tap is worth nothing but a haptic, and withdrawing is its own
 * labelled button.
 *
 * No optimistic state is tracked here: Firestore's local cache reflects a write
 * in the `onSnapshot` listener before it reaches the server, and rolls it back
 * itself if the write is rejected.
 */
const RespondControl = ({
	response,
	onRespond,
	onClear,
	disabled = false,
	debtLock,
	size = 'lg',
}: {
	/**
	 * The answer as the document has it, rather than only its status. Whether an
	 * In has got somebody onto the pitch comes off that same document, and this
	 * button may not claim more than it says.
	 */
	response: GameResponse | undefined;
	onRespond: (status: ResponseStatus) => Promise<void>;
	/** Withdraws the answer, back to no response at all. */
	onClear: () => Promise<void>;
	disabled?: boolean;
	/**
	 * Set when this player owes the season money, which takes the In half and
	 * leaves the rest of the control alone. Out and clearing stay live, because
	 * a debt is a reason to keep somebody off the pitch and never a reason to
	 * hold them inside a headcount somebody is booking a pitch against.
	 */
	debtLock?: DebtLock;
	size?: 'sm' | 'lg';
}) => {
	const [pending, setPending] = useState<ResponseStatus | 'clear' | null>(null);
	const { warn } = useToast();

	const status = response?.status;

	// An extra's In is the one answer that does not put them in the game until a
	// season admin says so, and this button sits directly above the note saying
	// exactly that. So it keeps the words they tapped and lets the fill, the
	// badge and the drained-out other half carry the selection on their own.
	const answerHonoured = getExtraSpot(response) !== 'pending';

	/**
	 * Whether the debt takes this half.
	 *
	 * Only the In half, and only while In is not already the answer. Somebody
	 * who said yes and was charged afterwards keeps their In drawn as the answer
	 * it is, and tapping it writes nothing anyway; draining it would say they
	 * had been dropped from a game they are still in.
	 */
	const refusedByDebt = (option: ResponseStatus) => !!debtLock && option === 'in' && status !== 'in';

	const write = async (job: ResponseStatus | 'clear', save: () => Promise<void>) => {
		if (disabled || pending) return;
		if (job !== 'clear' && refusedByDebt(job)) return;

		setPending(job);
		try {
			await save();
		} catch (error) {
			// This is the one control the app exists for. A rejected write used
			// to leave the button snapping back to its old state with the reason
			// only in the console, indistinguishable from a missed tap, and
			// unreported: `onRespond`/`onClear` are raw writes, not routed through
			// `useWrite`, so this catch is the only place that can tell us.
			console.error('Could not save your response', error);
			warn("Couldn't save your answer. Try again in a moment.");
			void captureError(error, { stage: 'respondControl' });
		} finally {
			setPending(null);
		}
	};

	const choose = async (next: ResponseStatus) => {
		// Answering what you already answered is not a change, so it writes
		// nothing. The haptic is there so a real press still lands as a press.
		if (next === status) {
			hapticLight();
			return;
		}

		hapticSuccess();
		await write(next, () => onRespond(next));
	};

	const withdraw = async () => {
		hapticLight();
		await write('clear', onClear);
	};

	/**
	 * The control is busy until the write comes back, and it has to *say* so.
	 *
	 * `write` has always refused a tap while one was in flight, but it refused
	 * it invisibly: every half stayed live and looked exactly as it does when
	 * it is waiting for you, so answering Out and then changing your mind
	 * quickly enough lost the second tap with nothing on screen to suggest it
	 * had not landed. And the window is longer than it looks. `aria-pressed`
	 * moves off Firestore's local cache, which reflects a write before the
	 * server has acknowledged it, so the control finishes *looking* settled a
	 * whole round trip before it is.
	 *
	 * Disabling is the honest version of the guard that was already there
	 * rather than a new rule: the same taps are refused, they are just refused
	 * where somebody can see it. `write` keeps its own check, because a
	 * `disabled` button is a thing the browser enforces and the guard is a thing
	 * this component promises.
	 */
	const busy = disabled || pending !== null;
	const large = size === 'lg';

	return (
		<div {...stylex.props(styles.root)}>
			<div {...stylex.props(styles.pair, large ? styles.pairLg : styles.pairSm)}>
				{OPTIONS.map(option => {
					const chosen = status === option.status;
					const standing: Standing = chosen ? 'chosen' : status ? 'passedOver' : 'offered';
					const Icon = chosen ? option.icons.chosen : option.icons.other;

					return (
						<button
							key={option.status}
							type='button'
							disabled={busy || refusedByDebt(option.status)}
							aria-pressed={chosen}
							onClick={() => choose(option.status)}
							{...stylex.props(
								styles.half,
								large ? styles.halfLg : styles.halfSm,
								WIDTHS[standing],
								option.styles[standing]
							)}
						>
							<Icon {...stylex.props(large ? styles.iconLg : styles.iconSm)} aria-hidden='true' />
							{pending === option.status
								? 'Saving…'
								: chosen && answerHonoured
									? option.chosenLabel
									: option.label}
						</button>
					);
				})}
			</div>

			{/* Small, quiet and set apart from the two targets above it, because
			    this is the action that used to happen by accident. Left out once
			    answers are closed, along with everything else there is no longer
			    any point offering. */}
			{status && !disabled && (
				<div {...stylex.props(styles.withdrawRow)}>
					<button type='button' disabled={busy} onClick={withdraw} {...stylex.props(styles.withdraw)}>
						{pending === 'clear' ? 'Clearing…' : 'Clear answer'}
					</button>
				</div>
			)}

			{/* At both sizes, unlike the line below it, and instead of it. A
			    disabled button with no reason beside it reads as a broken app,
			    and a game row is exactly where somebody meets this without the
			    season's notice on screen to explain it. */}
			{debtLock && !disabled && refusedByDebt('in') && (
				<p {...stylex.props(styles.note)}>
					You owe {formatSek(debtLock.outstanding)}.{' '}
					<Link href={debtLock.href} {...stylex.props(styles.settle)}>
						Settle up
					</Link>{' '}
					to sign up again.
				</p>
			)}

			{/* Only where the control stands alone. A game row carries a "No
			    answer" pill two lines above this, and saying it twice in one card
			    is worse than saying it once. */}
			{!status && !disabled && !debtLock && large && (
				<p {...stylex.props(styles.note)}>You haven&apos;t answered yet.</p>
			)}
		</div>
	);
};

export default RespondControl;
