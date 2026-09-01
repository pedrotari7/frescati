'use client';

import { useMemo, useState } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import type { Due, DueStatus, Expense, Receipt } from '@shared/types';
import type { PlayerLedger } from '@shared/finances';
import {
	dueLabel,
	duesByPlayer,
	duesFor,
	entryShare,
	feesFor,
	missingDues,
	paymentReference,
	planDues,
	summarise,
} from '@shared/finances';
import { counted, formatSek } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../lib/auth';
import { displayNameOf } from '../../../../../lib/people';
import { useDebtors, useDues, useExpenses, useReceipts, useUsersByUid } from '../../../../../hooks/useData';
import { useWrite } from '../../../../../hooks/useWrite';
import { useReceiptActions } from '../../../../../hooks/useReceiptActions';
import { useToast } from '../../../../../components/Toast';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import type { DuesReminderOutcome } from '../../../../../lib/db/finances';
import {
	addExpense,
	deleteDue,
	deleteExpense,
	fetchDues,
	fetchPlayedGameResponses,
	raiseDues,
	remindDebtors,
	setDueStatus,
} from '../../../../../lib/db/finances';
import { deleteReceipt, uploadReceipt } from '../../../../../lib/db/receipts';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Button from '../../../../../components/Button';
import StatusPill from '../../../../../components/StatusPill';
import FinanceOverview from '../../../../../components/FinanceOverview';
import DuesBook from '../../../../../components/DuesBook';
import ExpenseList from '../../../../../components/ExpenseList';
import ReceiptList from '../../../../../components/ReceiptList';
import SwishPay from '../../../../../components/SwishPay';
import { SectionHeading } from '../../../../../components/Section';

/**
 * How many of the people chased the chase got to.
 *
 * Nothing on either count means it reached that person not at all, and the mark
 * beside their name records no chase. Worth saying while the admin is still
 * looking at the screen, because the alternative is waiting a week for a payment
 * nobody was ever asked for.
 */
const reachedCount = (reminded: DuesReminderOutcome[]): number =>
	reminded.filter(outcome => outcome.pushed + outcome.emailed > 0).length;

/**
 * Where the season's money is.
 *
 * Two questions, and who is asking decides which one the screen answers. A
 * member or a season admin gets the books: both balances, what everybody owes,
 * and what has been bought. Anybody else gets their own dues and the spending,
 * which is all the security rules will hand them, and all a guest who played
 * once needs.
 *
 * That is stricter than the rest of the app, where signing in reads everything.
 * The README's argument for an open group is that an extra has to be able to
 * find a game and put their hand up; none of it reaches "who still hasn't paid".
 *
 * Charges are documents an admin raises rather than a sum worked out on the fly.
 * `shared/finances.ts` has the argument; the consequence here is the button below
 * that offers to raise the ones that are missing, and the sweep behind it, which
 * holds the only one-shot reads in the app.
 */
const FinancesPage = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin, isMember } = useSeasonContext();
	const { user } = useAuth();
	const { usersByUid } = useUsersByUid();
	const write = useWrite();
	const { notify } = useToast();
	const confirm = useConfirm();

	const uid = user?.uid ?? null;
	const squad = isMember || isAdmin;

	const { dues, loading: duesLoading } = useDues(seasonId, uid, squad);
	const { debtors } = useDebtors(seasonId, squad);
	const { expenses } = useExpenses(seasonId);
	const { receipts } = useReceipts(seasonId, squad);
	const { download, copyLink } = useReceiptActions(seasonId);

	const [missing, setMissing] = useState<number | null>(null);
	const [sweeping, setSweeping] = useState(false);

	const summary = useMemo(() => summarise(dues, expenses, feesFor(season ?? {}).total), [dues, expenses, season]);
	const book = useMemo(() => duesByPlayer(dues), [dues]);
	const mine = useMemo(() => (uid ? duesFor(uid, dues) : { dues: [], outstanding: 0 }), [uid, dues]);

	// The one thing the marks know that the charges don't. Everything else on
	// this screen is worked out from the book, which lands a trigger's round trip
	// sooner, so the marks are read for `remindedAt` and nothing else.
	const chasedAt = useMemo(
		() => new Map(debtors.flatMap(debtor => (debtor.remindedAt ? [[debtor.uid, debtor.remindedAt] as const] : []))),
		[debtors]
	);

	if (loading || duesLoading) {
		return (
			<SeasonShell title='Finances' backHref={`/s/${seasonId}/members`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Finances' backHref={`/s/${seasonId}/members`}>
				<LoadFailed what='the season finances' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Finances' backHref={`/s/${seasonId}/members`}>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const fees = feesFor(season);
	const share = entryShare(fees.total, season.memberUids.length);
	const collecting = fees.total > 0 || fees.perGame > 0;

	// Counted off the book rather than the marks, so the button's number is the
	// one the admin can see in the list right above it. The send goes by the
	// marks either way, and the two disagree only for as long as a trigger runs.
	const owing = book.filter(player => player.outstanding > 0);

	// Shared with the season's own debt notice, which names the same charges to
	// the person who owes them. It lives in `shared/finances.ts` because the two
	// screens would eventually disagree about the same line.
	const labelFor = (due: Due) => dueLabel(due, games, season.slot.timezone);

	/**
	 * Work out which charges ought to exist, and raise the ones that don't.
	 *
	 * One query per played game, so it runs when an admin presses it rather than
	 * on load. Split in two on purpose: the first press says how many are
	 * missing, the second raises them, because "raise 43 charges" is not a thing
	 * to find out you have done.
	 *
	 * Both halves are read here rather than taken off the screen. The book above
	 * is a live listener whose first event comes out of the local cache, and this
	 * is the one thing on the page that turns a count into documents; the two
	 * presses have to be answering the same question or the second one silently
	 * does nothing.
	 */
	const sweep = async (raise: boolean) => {
		setSweeping(true);

		try {
			const [responsesByGame, raised] = await Promise.all([
				fetchPlayedGameResponses(seasonId, games),
				fetchDues(seasonId),
			]);
			const planned = missingDues(planDues(season, responsesByGame), raised);

			if (!raise || planned.length === 0) {
				setMissing(planned.length);

				return;
			}

			const ok = await write(() => raiseDues(seasonId, planned), "Couldn't raise those charges.");

			if (ok) {
				notify(`Raised ${planned.length} ${planned.length === 1 ? 'charge' : 'charges'}.`);
				setMissing(0);
			}
		} catch (cause) {
			await write(() => Promise.reject(cause), "Couldn't work out what is owed.");
		} finally {
			setSweeping(false);
		}
	};

	const handleSettle = (due: Due, status: DueStatus) =>
		write(() => setDueStatus(seasonId, due.id, status, uid ?? ''), "Couldn't record that.");

	const handleDeleteDue = async (due: Due) => {
		const ok = await confirm({
			title: 'Remove this charge?',
			message: 'It disappears from the books. Use it for a charge that should never have been raised.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteDue(seasonId, due.id), "Couldn't remove that charge.");
	};

	/**
	 * Tell somebody they owe money.
	 *
	 * The request carries uids and nothing else. What each person owes, how many
	 * charges it is spread across and whether the debt is also holding their In
	 * are all read at the far end off the marks a trigger writes, so a screen a
	 * few seconds stale cannot send a figure that was never true. Somebody who
	 * paid between the render and the press has no mark left and is quietly not
	 * sent to, rather than accused.
	 *
	 * `Button` owns the spinner, so there is no pending state here. `describe` is
	 * what stands in its place, because the outcome is worth reading. A chase
	 * that reached nobody looks exactly like one that worked.
	 */
	const chase = async (uids: string[] | undefined, describe: (reminded: DuesReminderOutcome[]) => string) => {
		const reminded: DuesReminderOutcome[] = [];

		const ok = await write(async () => {
			reminded.push(...(await remindDebtors(seasonId, uids)));
		}, "Couldn't send that reminder.");

		if (ok) notify(describe(reminded));
	};

	const handleRemind = (player: PlayerLedger) => {
		const name = displayNameOf(usersByUid.get(player.uid));

		return chase([player.uid], reminded =>
			reachedCount(reminded) > 0 ? `Chased ${name}.` : `The app cannot reach ${name}.`
		);
	};

	const handleRemindEveryone = async () => {
		const ok = await confirm({
			title: `Remind ${counted(owing.length, 'player')}?`,
			message: 'Each of them gets a notification naming their own amount. There is no taking it back.',
			confirmLabel: 'Send',
		});

		if (!ok) return;

		await chase(undefined, reminded => {
			const reached = reachedCount(reminded);

			if (reminded.length === 0) return 'Nobody owes anything.';

			return reached === reminded.length
				? `Chased ${counted(reached, 'player')}.`
				: `Chased ${reached} of ${reminded.length}. The app cannot reach the rest.`;
		});
	};

	const handleUploadReceipt = (file: File, name: string) =>
		write(() => uploadReceipt(seasonId, file, name, uid ?? ''), "Couldn't upload that receipt.");

	const handleDeleteReceipt = async (receipt: Receipt) => {
		const ok = await confirm({
			title: `Remove ${receipt.name}?`,
			message: 'The file goes with it, and every link anybody has to it stops working.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteReceipt(seasonId, receipt.id), `Couldn't remove ${receipt.name}.`);
	};

	const handleAddExpense = (expense: { description: string; amount: number; date: string }) =>
		write(() => addExpense(seasonId, expense, uid ?? ''), "Couldn't record that purchase.");

	const handleDeleteExpense = async (expense: Expense) => {
		const ok = await confirm({
			title: `Remove ${expense.description}?`,
			message: 'The money goes back into the pot it came out of.',
			confirmLabel: 'Remove',
			tone: 'danger',
		});

		if (!ok) return;

		await write(() => deleteExpense(seasonId, expense.id), `Couldn't remove ${expense.description}.`);
	};

	const yourDues = (
		<section className='space-y-3'>
			<div className='flex items-center gap-2 px-1'>
				<SectionHeading>What you owe</SectionHeading>
				{mine.outstanding > 0 ? (
					<StatusPill tone='out'>{formatSek(mine.outstanding)}</StatusPill>
				) : (
					<StatusPill tone='in'>Nothing</StatusPill>
				)}
			</div>

			{mine.dues.length === 0 ? (
				<p className='text-faint px-1 text-sm'>
					{collecting
						? 'Nothing has been charged to you yet.'
						: 'This season is free to play. Nothing is being collected.'}
				</p>
			) : (
				<DuesBook
					book={uid ? [{ uid, ...mine, charged: mine.dues.reduce((t, d) => t + d.amount, 0) }] : []}
					usersByUid={usersByUid}
					labelFor={labelFor}
					canSettle={false}
					onSettle={handleSettle}
					onDelete={handleDeleteDue}
				/>
			)}

			{mine.outstanding > 0 && fees.swish && (
				<SwishPay
					payee={fees.swish}
					amount={mine.outstanding}
					message={paymentReference(season.name, user?.displayName ?? '')}
				/>
			)}

			{/* The season collects to somebody, that somebody is almost always an
			    admin, and they owe their own share like everybody else, so the app
			    draws them a code to pay themselves. Nothing here can tell: a user
			    document holds no phone number, so there is nothing to compare
			    `fees.swish` against. Worth a line rather than nothing, because
			    Swish refuses a self-payment with the same "the link used to open
			    the app has an incorrect format" it gives a malformed one, which
			    reads as a broken app and cost a whole evening to work out. */}
			{isAdmin && mine.outstanding > 0 && fees.swish && (
				<p className='text-faint px-1 text-xs leading-relaxed'>
					Swish will not let you pay your own number, and it says the link has an incorrect format rather than
					saying that. If the number above is yours, the code is fine. Mark your own charge paid in the book
					below instead.
				</p>
			)}

			{mine.outstanding > 0 && !fees.swish && (
				<p className='text-faint px-1 text-xs leading-relaxed'>
					No Swish number is set for this season, so ask an admin where to send it. An admin can add one in
					the season settings.
				</p>
			)}
		</section>
	);

	// An admin who has not set a fee has nothing to collect, so the sweep would
	// find nothing and say so cryptically. Point at the settings instead.
	const sweepPanel = isAdmin ? (
		<section className='glass space-y-3 rounded-2xl p-5'>
			<div>
				<h2 className='text-ink font-semibold'>Raise the charges</h2>
				<p className='text-faint mt-1 text-xs leading-relaxed'>
					{collecting
						? `${formatSek(fees.total)} for the season, ${formatSek(share)} each across ${season.memberUids.length} members. ${formatSek(fees.perGame)} per game for an extra who turned up, and nobody is charged for a game they were marked absent from.`
						: 'The season costs nothing and extras play free, so there is nothing to charge. Set the fees in the season settings first.'}
				</p>
			</div>

			{missing !== null && (
				<p className='text-muted text-sm'>
					{missing === 0
						? 'Every charge that should exist already does.'
						: `${missing} ${missing === 1 ? 'charge is' : 'charges are'} missing.`}
				</p>
			)}

			<div className='flex gap-3'>
				<Button variant='secondary' fullWidth disabled={!collecting} onClick={() => sweep(false)}>
					Check what is missing
				</Button>
				<Button
					variant='primary'
					fullWidth
					loading={sweeping}
					disabled={!collecting || missing === null || missing === 0}
					onClick={() => sweep(true)}
				>
					{missing ? `Raise ${missing}` : 'Raise'}
				</Button>
			</div>
		</section>
	) : null;

	return (
		<SeasonShell title='Finances' subtitle={season.name} backHref={`/s/${seasonId}/members`}>
			<div className='space-y-6 p-4'>
				{squad ? (
					<>
						<FinanceOverview summary={summary} memberCount={season.memberUids.length} />

						{yourDues}

						{/* Between what somebody owes and what everybody owes,
						    because it is the other half of the first one: you paid
						    for a season, and this is the piece of paper that gets
						    some of it back. */}
						<section className='space-y-3'>
							<div className='flex items-center gap-2 px-1'>
								<SectionHeading>Receipts</SectionHeading>
								{receipts.length > 0 && (
									<StatusPill tone='neutral'>{counted(receipts.length, 'file')}</StatusPill>
								)}
							</div>

							<p className='text-faint px-1 text-xs leading-relaxed'>
								What to hand your employer if you claim friskv&aring;rdsbidrag. Downloading takes your
								own copy. The link beside it opens this receipt for anybody in this season and for
								nobody else, so it is safe to paste into the group chat.
							</p>

							<ReceiptList
								receipts={receipts}
								canEdit={isAdmin}
								onUpload={handleUploadReceipt}
								onDownload={download}
								onCopyLink={copyLink}
								onDelete={handleDeleteReceipt}
							/>
						</section>

						<section className='space-y-3'>
							<SectionHeading className='px-1'>Who owes what</SectionHeading>

							{/* Over the list rather than under it. A season with
							    enough people owing to be worth one press is a book
							    long enough that the button sits off the bottom of a
							    phone, and it belongs to the names below it, not to
							    the panel further down about raising charges that do
							    not exist yet. Kept even when nobody owes, disabled,
							    so the button an admin is looking for does not move
							    around on them. */}
							{isAdmin && (
								<>
									<Button
										variant='secondary'
										fullWidth
										disabled={owing.length === 0}
										onClick={handleRemindEveryone}
									>
										{owing.length === 0
											? 'Everybody is settled up'
											: `Remind all ${owing.length} who owe`}
									</Button>

									<p className='text-faint px-1 text-xs leading-relaxed'>
										A reminder names one person&apos;s own amount and links to this page, and says
										nothing about anybody else. There is no switch for it in their notification
										settings; paying is what stops it.
									</p>
								</>
							)}

							<DuesBook
								book={book}
								usersByUid={usersByUid}
								labelFor={labelFor}
								canSettle={isAdmin}
								chasedAt={chasedAt}
								onSettle={handleSettle}
								onDelete={handleDeleteDue}
								onRemind={isAdmin ? handleRemind : undefined}
							/>

							{!isAdmin && (
								<p className='text-faint px-1 text-xs leading-relaxed'>
									Only a season admin can mark a payment. Paying does not tick anything off by itself.
								</p>
							)}
						</section>

						{sweepPanel}
					</>
				) : (
					<>
						{/* An extra sees their own dues and what the group has
						    bought, and no collected total. Totalling a collection
						    they cannot read would need a function-owned summary
						    document, which is a whole Cloud Function so that a
						    guest can see one number. Left out on purpose. */}
						{yourDues}
					</>
				)}

				<section className='space-y-3'>
					<div className='flex items-center gap-2 px-1'>
						<SectionHeading>What the money bought</SectionHeading>
						{expenses.length > 0 && (
							<StatusPill tone='neutral'>{formatSek(summary.extras.spent)}</StatusPill>
						)}
					</div>

					<ExpenseList
						expenses={expenses}
						canEdit={isAdmin}
						onAdd={handleAddExpense}
						onDelete={handleDeleteExpense}
					/>
				</section>

				{!collecting && !isAdmin && (
					<EmptyState
						icon={<BanknotesIcon />}
						title='Nothing to pay'
						message='This season costs nothing to join and extras play free.'
					/>
				)}
			</div>
		</SeasonShell>
	);
};

export default FinancesPage;
