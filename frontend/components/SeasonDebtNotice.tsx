'use client';

import Link from 'next/link';
import { ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { Game, Season } from '@shared/types';
import type { DebtStanding } from '@shared/finances';
import { dueLabel, feesFor, paymentReference } from '@shared/finances';
import { formatSek } from '@shared/format';
import StatusPill from './StatusPill';
import SwishPay from './SwishPay';

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
		<section className='glass animate-rise shadow-glass space-y-4 rounded-3xl p-5'>
			<div className='flex items-start gap-3'>
				<ExclamationTriangleIcon className='text-pending mt-0.5 size-5 shrink-0' aria-hidden='true' />
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<h2 className='text-ink font-semibold'>What you owe</h2>
						<StatusPill tone='out'>{formatSek(debt.outstanding)}</StatusPill>
					</div>

					{/* An admin gets the same amount and none of the lock, so the
					    line under it has to be a different line. Theirs says what
					    they owe, because they owe their share like everybody else;
					    a player's says what it costs them, which is the part they
					    need in order to understand why the buttons below stopped
					    working. */}
					<p className='text-muted mt-1 text-sm leading-relaxed'>
						{blocked
							? 'You cannot sign up for another game until this is settled. Saying you cannot make it still works, and so does everything else in the app.'
							: 'You run this season, so nothing is locked. Everybody else who owes cannot sign up until they have settled.'}
					</p>
				</div>
			</div>

			<ul className='space-y-1.5'>
				{debt.dues.map(due => (
					<li key={due.id} className='flex items-baseline justify-between gap-3 text-sm'>
						<span className='text-muted min-w-0 truncate'>
							{dueLabel(due, games, season.slot.timezone)}
							{due.note && <span className='text-faint'> · {due.note}</span>}
						</span>
						<span className='text-ink shrink-0 font-semibold tabular-nums'>{formatSek(due.amount)}</span>
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
				<p className='text-faint text-xs leading-relaxed'>
					No Swish number is set for this season, so ask an admin where to send it.
				</p>
			)}

			{/* Paying is not the same event as being marked paid, and only an admin
			    can do the second one. Without this the notice reads as a thing that
			    clears itself, and somebody who has paid sits looking at a dead
			    button wondering what else they were supposed to do. */}
			<p className='text-faint text-xs leading-relaxed'>
				An admin has to mark the payment before this clears. It is not automatic.
			</p>

			<Link
				href={`/s/${season.id}/finances`}
				className='group focus-visible:ring-brand/60 -mx-2 flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none'
			>
				<span className='text-brand min-w-0 flex-1 text-sm font-semibold'>See the whole book</span>
				<ChevronRightIcon
					className='text-faint size-4 shrink-0 transition-transform group-hover:translate-x-0.5'
					aria-hidden='true'
				/>
			</Link>
		</section>
	);
};

export default SeasonDebtNotice;
