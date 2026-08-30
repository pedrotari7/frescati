'use client';

import { useState } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import type { Season } from '@shared/types';
import type { SwishPayment } from '@shared/swish';
import { swishAppUrl, toAlias, toInternational, toLocal } from '@shared/swish';
import { REFERENCE_LIMIT, entryShare, feesFor, paymentReference } from '@shared/finances';
import { formatSek } from '@shared/format';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';
import SwishPay from './SwishPay';
import { Field, TextInput } from './Field';

const NOTHING: SwishPayment = { payee: '', amount: 0, message: '' };

/**
 * Everything the panel takes off the season, worked out in one place.
 *
 * One nullable rather than a season and its fees carried side by side, because
 * the two are null together and nothing in the types says so, which left every
 * field checking both. An entry share is the amount worth drawing, since it is
 * what most people owe. A season with no bill of its own falls to what an extra
 * pays for a game, the only other number it charges anybody.
 */
const readSeason = (season: Season, displayName: string) => {
	const fees = feesFor(season);
	const share = entryShare(fees.total, season.memberUids.length);

	return {
		fees,
		share,
		members: season.memberUids.length,
		payment: {
			payee: fees.swish ?? '',
			amount: share || fees.perGame,
			message: paymentReference(season.name, displayName),
		},
	};
};

/**
 * A Swish handoff you can point a phone at without owing anybody anything.
 *
 * Everything the payment code does on our side is already proved somewhere.
 * `shared/swish.ts` and `shared/finances.ts` are pure and unit tested, and
 * `e2e/finances.spec.ts` drives the sweep, the settle, and the QR at both
 * widths. What none of that reaches is the far end: whether a camera opens the
 * code at all, and whether the link it carries is one the real Swish app
 * accepts. Answering either needs a phone and the actual app, which is the same
 * reason push has a panel on this screen.
 *
 * Getting to a QR in the app proper means personally owing money, because the
 * finances screen draws `SwishPay` only when `mine.outstanding > 0`. So testing
 * the handoff used to cost a charge raised against yourself in a real season's
 * books and left unpaid. This raises nothing. It reads the season document and
 * writes nothing at all.
 *
 * The defaults come off the selected season rather than from constants, because
 * a number written down here would prove the QR library works and say nothing
 * about whether this season's own configuration produces a code anybody can pay.
 *
 * The one trap this panel walks you straight into: the number it fills in is the
 * season's, the person testing is usually the admin whose number that is, and
 * Swish will not let anybody pay themselves. It refuses with "the link used to
 * open the app has an incorrect format", the same message a genuinely malformed
 * link gets, so the panel reads as proof the format is wrong when it is proof of
 * nothing at all. Hence the note on the number field. Scan it from a different
 * phone, or type somebody else's number.
 */
const PaymentTriggers = ({ season, displayName }: { season: Season | null; displayName: string }) => {
	const write = useWrite();
	const [overrides, setOverrides] = useState<Partial<SwishPayment>>({});

	const from = season ? readSeason(season, displayName) : null;

	// Overrides over the season's values, rather than state seeded from them. The
	// season list lands after the first render, so copying it into state gives a
	// frame holding nothing and then a sync effect to fix it. Here a field you
	// have typed in stays pinned and every field you haven't follows the picker.
	const payment: SwishPayment = { ...(from?.payment ?? NOTHING), ...overrides };
	const set = (patch: Partial<SwishPayment>) => setOverrides(previous => ({ ...previous, ...patch }));

	// A zero amount and an empty payee both build a link Swish rejects, and a QR
	// that fails for that reason looks exactly like one that fails because the
	// format is wrong, which is the thing being tested.
	const payable = payment.payee.trim() !== '' && payment.amount > 0;
	const link = payable ? swishAppUrl(payment) : null;

	return (
		<section className='glass rounded-2xl p-5'>
			<div className='mb-1 flex items-center gap-2'>
				<BanknotesIcon className='text-muted size-5' aria-hidden='true' />
				<h2 className='text-ink font-semibold'>Take a payment on purpose</h2>
			</div>

			<p className='text-muted mb-4 text-sm leading-relaxed'>
				The same panel a player sees when they owe money, built from the season you picked above, with no charge
				raised against anybody. Scan it with the phone you want to test. Nothing here writes to the books.
			</p>

			<p className='text-pending mb-5 text-xs leading-relaxed'>
				The code is live. Nothing moves until somebody confirms the payment in their own Swish app. If they do,
				that is a real payment to a real number, and no charge in this app is marked against it.
			</p>

			<div className='space-y-4'>
				<Field
					label='Swish number'
					hint={
						from?.fees.swish
							? `The season collects to ${toLocal(from.fees.swish)}. Swish refuses a payment to your own number, so scan this from a phone that is not the one this number belongs to.`
							: 'This season has no number set, so the app offers its players no way to pay. Type one to test the handoff anyway.'
					}
				>
					<TextInput
						type='tel'
						inputMode='tel'
						value={payment.payee}
						placeholder='0701234567'
						onChange={event => set({ payee: event.target.value })}
					/>
				</Field>

				<Field
					label='Amount'
					hint={
						from
							? `${formatSek(from.share)} each across ${from.members} members, ${formatSek(from.fees.perGame)} for an extra's game.`
							: 'Pick a season above to fill this in from its fees.'
					}
				>
					<TextInput
						type='number'
						inputMode='numeric'
						min={0}
						value={payment.amount}
						onChange={event => set({ amount: Number(event.target.value) })}
					/>
				</Field>

				<Field
					label='Reference'
					hint={
						// Counted rather than just shown, because this is the string an
						// admin reads off a bank statement to work out whose payment
						// landed, and `paymentReference` cuts it without saying so. A
						// long season name plus a long player name loses the surname.
						payment.message.length >= REFERENCE_LIMIT
							? `${payment.message.length}/${REFERENCE_LIMIT} characters, so this is cut. An admin reconciling it sees only this much.`
							: `${payment.message.length}/${REFERENCE_LIMIT} characters.`
					}
				>
					<TextInput
						value={payment.message}
						placeholder='Fall 2026: Anna Berg'
						onChange={event => set({ message: event.target.value })}
					/>
				</Field>
			</div>

			{link ? (
				<>
					<h3 className='text-faint mt-6 mb-2 text-xs font-semibold tracking-wider uppercase'>
						What Swish is handed
					</h3>

					{/* What a player is never shown. The link itself, so a code that
					    will not scan can be read rather than guessed at, and every form
					    of the number, because an admin who typed +46 70 123 45 67 into
					    the season settings has to come out of all of them correctly and
					    only the last one goes into the link. */}
					<dl className='space-y-2 text-xs'>
						<div>
							<dt className='text-faint'>Link, in the code and behind the button</dt>
							<dd className='text-ink mt-0.5 font-mono break-all'>{link}</dd>
						</div>

						<div className='flex justify-between gap-3'>
							<dt className='text-faint'>Number, every form</dt>
							<dd className='text-ink font-medium'>
								{toLocal(payment.payee)} · {toInternational(payment.payee)} · {toAlias(payment.payee)}
							</dd>
						</div>
					</dl>

					<Button
						size='sm'
						variant='secondary'
						className='mt-3'
						onClick={() => write(() => navigator.clipboard.writeText(link), "Couldn't copy the link.")}
					>
						Copy link
					</Button>

					{/* The real component, not a copy of it. A change to what a player is
					    shown is then a change to what this screen proves, which is the
					    same reason the push panel renders the payload the function sent
					    back rather than one composed here. */}
					<div className='mt-4'>
						<SwishPay payee={payment.payee} amount={payment.amount} message={payment.message} />
					</div>
				</>
			) : (
				<p className='text-faint mt-6 text-xs leading-relaxed'>
					Set a number and an amount above zero and the code is drawn here. Swish refuses a link missing
					either, and a code that fails for that reason looks exactly like one whose format is wrong.
				</p>
			)}
		</section>
	);
};

export default PaymentTriggers;
