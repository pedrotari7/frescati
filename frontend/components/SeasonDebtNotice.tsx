'use client';

import Link from 'next/link';
import { ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import type { DebtStanding } from '@shared/finances';
import { dueLabel, feesFor, paymentReference } from '@shared/finances';
import { formatSek } from '@shared/format';
import StatusPill from './StatusPill';
import SwishPay from './SwishPay';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, focus, nudge, surfaces } from '../lib/styles';

const styles = stylex.create({
	card: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 24, padding: 20 },

	head: { display: 'flex', alignItems: 'flex-start', gap: 12 },
	warnIcon: { color: colors.pending, marginTop: 2, width: 20, height: 20, flexShrink: 0 },
	headBody: { minWidth: 0, flexGrow: 1, flexBasis: '0%' },
	headLine: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: 1.625 },

	dues: { display: 'flex', flexDirection: 'column', gap: 6 },
	due: {
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'space-between',
		gap: 12,
		fontSize: 14,
		lineHeight: '20px',
	},
	dueLabel: { color: colors.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	dueNote: { color: colors.faint },
	dueAmount: { color: colors.ink, flexShrink: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },

	footnote: { color: colors.faint, fontSize: 12, lineHeight: 1.625 },

	more: {
		marginInline: -8,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		borderRadius: 12,
		paddingInline: 8,
		paddingBlock: 8,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	moreLabel: {
		color: colors.brand,
		minWidth: 0,
		flexGrow: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
	},
	moreIcon: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },
});

/**
 * What you owe this season, on the screen you land on, because it is the reason
 * the In button below it is dead.
 *
 * Above the games rather than instead of them. Hiding the calendar collects no
 * money and takes away the thing somebody needs in order to decide whether
 * paying is worth it, so the fixtures stay and the interaction is what goes.
 *
 * It itemises the charges rather than only totalling them, because the first
 * thought somebody blocked by a number has is that the number is wrong, and a
 * charge you cannot see is a charge you cannot dispute. Plain lines rather than
 * the finances screen's `DuesBook`: that table has avatars, per-charge menus and
 * an admin's settle buttons, none of which belong on a games list. The book
 * itself is one tap away, on the screen built to hold it.
 */
const SeasonDebtNotice = ({
	debt,
	season,
	games,
	displayName,
}: {
	/**
	 * Takes the whole standing rather than an amount and a boolean, so this
	 * cannot be drawn over a season that is paid up. `clear` renders nothing.
	 */
	debt: DebtStanding;
	season: Season;
	games: Game[];
	/** Goes on the payment, so an admin reading a bank statement knows whose it is. */
	displayName: string;
}) => {
	if (debt.standing === 'clear') return null;

	const fees = feesFor(season);
	const blocked = debt.standing === 'blocked';

	return (
		<section {...stylex.props(surfaces.glass, elevation.glass, animations.rise, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<ExclamationTriangleIcon {...stylex.props(styles.warnIcon)} aria-hidden='true' />
				<div {...stylex.props(styles.headBody)}>
					<div {...stylex.props(styles.headLine)}>
						<h2 {...stylex.props(styles.title)}>What you owe</h2>
						<StatusPill tone='out'>{formatSek(debt.outstanding)}</StatusPill>
					</div>

					{/* An admin gets the same amount and none of the lock, so the
					    line under it has to be a different line. Theirs says what
					    they owe, because they owe their share like everybody else;
					    a player's says what it costs them, which is the part they
					    need in order to understand why the buttons below stopped
					    working. */}
					<p {...stylex.props(styles.blurb)}>
						{blocked
							? 'You cannot sign up for another game until this is settled. Saying you cannot make it still works, and so does everything else in the app.'
							: 'You run this season, so nothing is locked. Everybody else who owes cannot sign up until they have settled.'}
					</p>
				</div>
			</div>

			<ul {...stylex.props(styles.dues)}>
				{debt.dues.map(due => (
					<li key={due.id} {...stylex.props(styles.due)}>
						<span {...stylex.props(styles.dueLabel)}>
							{dueLabel(due, games, season.slot.timezone)}
							{due.note && <span {...stylex.props(styles.dueNote)}> · {due.note}</span>}
						</span>
						<span {...stylex.props(styles.dueAmount)}>{formatSek(due.amount)}</span>
					</li>
				))}
			</ul>

			{fees.swish ? (
				<SwishPay
					payee={fees.swish}
					amount={debt.outstanding}
					message={paymentReference(season.name, displayName)}
				/>
			) : (
				<p {...stylex.props(styles.footnote)}>
					No Swish number is set for this season, so ask an admin where to send it.
				</p>
			)}

			{/* Paying is not the same event as being marked paid, and only an admin
			    can do the second one. Without this the notice reads as a thing that
			    clears itself, and somebody who has paid sits looking at a dead
			    button wondering what else they were supposed to do. */}
			<p {...stylex.props(styles.footnote)}>
				An admin has to mark the payment before this clears. It is not automatic.
			</p>

			<Link href={`/s/${season.id}/finances`} {...stylex.props(focus.ring, nudge.row, styles.more)}>
				<span {...stylex.props(styles.moreLabel)}>See the whole book</span>
				<ChevronRightIcon {...stylex.props(styles.moreIcon, nudge.chevron)} aria-hidden='true' />
			</Link>
		</section>
	);
};

export default SeasonDebtNotice;
