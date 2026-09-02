'use client';

import { useState } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Season } from '@shared/types';
import type { SwishPayment } from '@shared/swish';
import { swishAppUrl, toAlias, toInternational, toLocal } from '@shared/swish';
import { REFERENCE_LIMIT, entryShare, feesFor, paymentReference } from '@shared/finances';
import { formatSek } from '@shared/format';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';
import SwishPay from './SwishPay';
import { Field, TextInput } from './Field';
import { colors, fonts } from '../app/tokens.stylex';
import { surfaces, text } from '../lib/styles';

const NOTHING: SwishPayment = { payee: '', amount: 0, message: '' };

const styles = stylex.create({
	card: { borderRadius: 16, padding: 20 },
	head: { marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
	headIcon: { color: colors.muted, width: 20, height: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	blurb: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },
	warning: { color: colors.pending, marginBottom: 20, fontSize: 12, lineHeight: 1.625 },

	fields: { display: 'flex', flexDirection: 'column', gap: 16 },

	heading: { marginTop: 24, marginBottom: 8 },
	facts: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 },
	factLabel: { color: colors.faint },
	link: {
		color: colors.ink,
		marginTop: 2,
		fontFamily: fonts.mono,
		overflowWrap: 'break-word',
		wordBreak: 'break-all',
	},
	numberRow: { display: 'flex', justifyContent: 'space-between', gap: 12 },
	numbers: { color: colors.ink, fontWeight: 500 },
	copy: { marginTop: 12 },
	preview: { marginTop: 16 },

	none: { color: colors.faint, marginTop: 24, fontSize: 12, lineHeight: 1.625 },
});

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
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<BanknotesIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
				<h2 {...stylex.props(styles.title)}>Take a payment on purpose</h2>
			</div>

			<p {...stylex.props(styles.blurb)}>
				The same panel a player sees when they owe money, built from the season you picked above, with no charge
				raised against anybody. Scan it with the phone you want to test. Nothing here writes to the books.
			</p>

			<p {...stylex.props(styles.warning)}>
				The code is live. Nothing moves until somebody confirms the payment in their own Swish app. If they do,
				that is a real payment to a real number, and no charge in this app is marked against it.
			</p>

			<div {...stylex.props(styles.fields)}>
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
					<h3 {...stylex.props(text.sectionHeading, styles.heading)}>What Swish is handed</h3>

					{/* What a player is never shown. The link itself, so a code that
					    will not scan can be read rather than guessed at, and every form
					    of the number, because an admin who typed +46 70 123 45 67 into
					    the season settings has to come out of all of them correctly and
					    only the last one goes into the link. */}
					<dl {...stylex.props(styles.facts)}>
						<div>
							<dt {...stylex.props(styles.factLabel)}>Link, in the code and behind the button</dt>
							<dd {...stylex.props(styles.link)}>{link}</dd>
						</div>

						<div {...stylex.props(styles.numberRow)}>
							<dt {...stylex.props(styles.factLabel)}>Number, every form</dt>
							<dd {...stylex.props(styles.numbers)}>
								{toLocal(payment.payee)} · {toInternational(payment.payee)} · {toAlias(payment.payee)}
							</dd>
						</div>
					</dl>

					<Button
						size='sm'
						variant='secondary'
						sx={styles.copy}
						onClick={() => write(() => navigator.clipboard.writeText(link), "Couldn't copy the link.")}
					>
						Copy link
					</Button>

					{/* The real component, not a copy of it. A change to what a player is
					    shown is then a change to what this screen proves, which is the
					    same reason the push panel renders the payload the function sent
					    back rather than one composed here. */}
					<div {...stylex.props(styles.preview)}>
						<SwishPay payee={payment.payee} amount={payment.amount} message={payment.message} />
					</div>
				</>
			) : (
				<p {...stylex.props(styles.none)}>
					Set a number and an amount above zero and the code is drawn here. Swish refuses a link missing
					either, and a code that fails for that reason looks exactly like one whose format is wrong.
				</p>
			)}
		</section>
	);
};

export default PaymentTriggers;
