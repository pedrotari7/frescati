'use client';

import { useMemo, useState } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Due, DueStatus, Expense, Game, Receipt, Season, SeasonFees } from '@shared/types';
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
import { colors } from '../../../../tokens.stylex';
import { surfaces } from '../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	/* Every section on this screen is a heading, a line of explanation and a
	   list, stacked at the same rhythm. */
	group: { display: 'flex', flexDirection: 'column', gap: 12 },

	/* The px-1 lines the heading up with the text inside the cards below it,
	   which have their own padding; without it the label hangs off to the left. */
	head: { display: 'flex', alignItems: 'center', gap: 8, paddingInline: 4 },
	heading: { paddingInline: 4 },
	empty: { color: colors.faint, paddingInline: 4, fontSize: 14, lineHeight: '20px' },
	note: { color: colors.faint, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },

	sweep: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 20 },
	sweepTitle: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	sweepNote: { color: colors.faint, marginTop: 4, fontSize: 12, lineHeight: 1.625 },
	sweepCount: { color: colors.muted, fontSize: 14, lineHeight: '20px' },
	/* Check and Raise side by side. Two full-width buttons stacked would put the
	   destructive one under the thumb that just pressed the safe one. */
	sweepActions: { display: 'flex', gap: 12 },
});

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
/** Everything the books let somebody change, in one place. */
const useBookActions = (seasonId: string, uid: string) => {
	const write = useWrite();
	const confirm = useConfirm();

	const ask = (title: string, message: string) => confirm({ title, message, confirmLabel: 'Remove', tone: 'danger' });

	return {
		settle: (due: Due, status: DueStatus) =>
			write(() => setDueStatus(seasonId, due.id, status, uid), "Couldn't record that."),

		removeDue: async (due: Due) => {
			const ok = await ask(
				'Remove this charge?',
				'It disappears from the books. Use it for a charge that should never have been raised.'
			);

			if (!ok) return;

			await write(() => deleteDue(seasonId, due.id), "Couldn't remove that charge.");
		},

		uploadReceipt: (file: File, name: string) =>
			write(() => uploadReceipt(seasonId, file, name, uid), "Couldn't upload that receipt."),

		removeReceipt: async (receipt: Receipt) => {
			const ok = await ask(
				`Remove ${receipt.name}?`,
				'The file goes with it, and every link anybody has to it stops working.'
			);

			if (!ok) return;

			await write(() => deleteReceipt(seasonId, receipt.id), `Couldn't remove ${receipt.name}.`);
		},

		addExpense: (expense: { description: string; amount: number; date: string }) =>
			write(() => addExpense(seasonId, expense, uid), "Couldn't record that purchase."),

		removeExpense: async (expense: Expense) => {
			const ok = await ask(`Remove ${expense.description}?`, 'The money goes back into the pot it came out of.');

			if (!ok) return;

			await write(() => deleteExpense(seasonId, expense.id), `Couldn't remove ${expense.description}.`);
		},
	};
};

/**
 * Telling somebody they owe money.
 *
 * The request carries uids and nothing else. What each person owes, how many
 * charges it is spread across and whether the debt is also holding their In are
 * all read at the far end off the marks a trigger writes, so a screen a few
 * seconds stale cannot send a figure that was never true. Somebody who paid
 * between the render and the press has no mark left and is quietly not sent to,
 * rather than accused.
 *
 * `Button` owns the spinner, so there is no pending state here. The description
 * each caller passes is what stands in its place, because the outcome is worth
 * reading. A chase that reached nobody looks exactly like one that worked.
 */
const useChase = (seasonId: string, usersByUid: Map<string, AppUser>) => {
	const write = useWrite();
	const confirm = useConfirm();
	const { notify } = useToast();

	const chase = async (uids: string[] | undefined, describe: (reminded: DuesReminderOutcome[]) => string) => {
		const reminded: DuesReminderOutcome[] = [];

		const ok = await write(async () => {
			reminded.push(...(await remindDebtors(seasonId, uids)));
		}, "Couldn't send that reminder.");

		if (ok) notify(describe(reminded));
	};

	const one = (player: PlayerLedger) => {
		const name = displayNameOf(usersByUid.get(player.uid));

		return chase([player.uid], reminded =>
			reachedCount(reminded) > 0 ? `Chased ${name}.` : `The app cannot reach ${name}.`
		);
	};

	const everyone = async (owing: number) => {
		const ok = await confirm({
			title: `Remind ${counted(owing, 'player')}?`,
			message: 'Each of them gets a notification naming their own amount. There is no taking it back.',
			confirmLabel: 'Send',
		});

		if (!ok) return;

		await chase(undefined, reminded => {
			if (reminded.length === 0) return 'Nobody owes anything.';

			const reached = reachedCount(reminded);

			return reached === reminded.length
				? `Chased ${counted(reached, 'player')}.`
				: `Chased ${reached} of ${reminded.length}. The app cannot reach the rest.`;
		});
	};

	return { one, everyone };
};

/**
 * Work out which charges ought to exist, and raise the ones that don't.
 *
 * One query per played game, so it runs when an admin presses it rather than on
 * load. Split in two on purpose: the first press says how many are missing, the
 * second raises them, because "raise 43 charges" is not a thing to find out you
 * have done.
 *
 * Both halves are read here rather than taken off the screen. The book is a
 * live listener whose first event comes out of the local cache, and this is the
 * one thing on the page that turns a count into documents; the two presses have
 * to be answering the same question or the second one silently does nothing.
 */
const useSweep = (seasonId: string, season: Season | null, games: Game[]) => {
	const write = useWrite();
	const { notify } = useToast();
	const [missing, setMissing] = useState<number | null>(null);
	const [sweeping, setSweeping] = useState(false);

	const sweep = async (raise: boolean) => {
		if (!season) return;

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

	return { missing, sweeping, sweep };
};

/**
 * Everything this screen reads off the book.
 *
 * `chasedAt` is the one thing the marks know that the charges do not.
 * Everything else here is worked out from the book, which lands a trigger's
 * round trip sooner, so the marks are read for `remindedAt` and nothing else.
 */
const useBooks = (
	season: Season | null,
	dues: Due[],
	expenses: Expense[],
	debtors: { uid: string; remindedAt?: string }[],
	uid: string | null
) => {
	const summary = useMemo(() => summarise(dues, expenses, feesFor(season ?? {}).total), [dues, expenses, season]);
	const book = useMemo(() => duesByPlayer(dues), [dues]);
	const mine = useMemo(() => (uid ? duesFor(uid, dues) : { dues: [], outstanding: 0 }), [uid, dues]);

	const chasedAt = useMemo(
		() => new Map(debtors.flatMap(debtor => (debtor.remindedAt ? [[debtor.uid, debtor.remindedAt] as const] : []))),
		[debtors]
	);

	return { summary, book, mine, chasedAt };
};

/** What the extras' money went on. */
const Bought = ({
	expenses,
	spent,
	isAdmin,
	onAdd,
	onDelete,
}: {
	expenses: Expense[];
	spent: number;
	isAdmin: boolean;
	onAdd: (expense: { description: string; amount: number; date: string }) => Promise<boolean>;
	onDelete: (expense: Expense) => void;
}) => (
	<section {...stylex.props(styles.group)}>
		<div {...stylex.props(styles.head)}>
			<SectionHeading>What the money bought</SectionHeading>
			{expenses.length > 0 && <StatusPill tone='neutral'>{formatSek(spent)}</StatusPill>}
		</div>

		<ExpenseList expenses={expenses} canEdit={isAdmin} onAdd={onAdd} onDelete={onDelete} />
	</section>
);

/** Who is looking, and what they are allowed to do about it. */
interface Viewer {
	uid: string | null;
	displayName: string;
	squad: boolean;
	isAdmin: boolean;
}

/** What the season charges, and whether it charges anything at all. */
interface Terms {
	season: Season;
	games: Game[];
	fees: SeasonFees;
	collecting: boolean;
}

/** Everything read off the dues, the expenses and the marks. */
interface Ledgers {
	summary: ReturnType<typeof summarise>;
	book: PlayerLedger[];
	mine: { dues: Due[]; outstanding: number };
	chasedAt: Map<string, string>;
	receipts: Receipt[];
	expenses: Expense[];
	usersByUid: Map<string, AppUser>;
}

/** Everything that writes, plus the two receipt reads that go with them. */
interface Hands {
	actions: ReturnType<typeof useBookActions>;
	remind: ReturnType<typeof useChase>;
	sweeper: ReturnType<typeof useSweep>;
	download: (receipt: Receipt) => Promise<void>;
	copyLink: (receipt: Receipt) => Promise<void>;
}

/** Why there are no books to show, drawn as the screen. */
const NoBooks = ({
	reason,
	backHref,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'missing';
	backHref: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Finances' backHref={backHref}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='the season finances' onRetry={onRetry} />}
		{reason === 'missing' && <EmptyState title='Season not found' />}
	</SeasonShell>
);

/** How to pay, and the two reasons the code might not help. */
const HowToPay = ({
	swish,
	outstanding,
	isAdmin,
	reference,
}: {
	swish: string | undefined;
	outstanding: number;
	isAdmin: boolean;
	reference: string;
}) => {
	if (outstanding === 0) return null;

	if (!swish) {
		return (
			<p {...stylex.props(styles.note)}>
				No Swish number is set for this season, so ask an admin where to send it. An admin can add one in the
				season settings.
			</p>
		);
	}

	return (
		<>
			<SwishPay payee={swish} amount={outstanding} message={reference} />

			{/* The season collects to somebody, that somebody is almost always an
			    admin, and they owe their own share like everybody else, so the app
			    draws them a code to pay themselves. Nothing here can tell: a user
			    document holds no phone number, so there is nothing to compare
			    `fees.swish` against. Worth a line rather than nothing, because
			    Swish refuses a self-payment with the same "the link used to open
			    the app has an incorrect format" it gives a malformed one, which
			    reads as a broken app and cost a whole evening to work out. */}
			{isAdmin && (
				<p {...stylex.props(styles.note)}>
					Swish will not let you pay your own number, and it says the link has an incorrect format rather than
					saying that. If the number above is yours, the code is fine. Mark your own charge paid in the book
					below instead.
				</p>
			)}
		</>
	);
};

/** What the person looking at this owes, and how to settle it. */
const YourDues = ({
	uid,
	mine,
	usersByUid,
	labelFor,
	collecting,
	fees,
	isAdmin,
	reference,
	onSettle,
	onDelete,
}: {
	uid: string | null;
	mine: { dues: Due[]; outstanding: number };
	usersByUid: Map<string, AppUser>;
	labelFor: (due: Due) => string;
	collecting: boolean;
	fees: SeasonFees;
	isAdmin: boolean;
	reference: string;
	onSettle: (due: Due, status: DueStatus) => void;
	onDelete: (due: Due) => void;
}) => (
	<section {...stylex.props(styles.group)}>
		<div {...stylex.props(styles.head)}>
			<SectionHeading>What you owe</SectionHeading>
			{mine.outstanding > 0 ? (
				<StatusPill tone='out'>{formatSek(mine.outstanding)}</StatusPill>
			) : (
				<StatusPill tone='in'>Nothing</StatusPill>
			)}
		</div>

		{mine.dues.length === 0 ? (
			<p {...stylex.props(styles.empty)}>
				{collecting
					? 'Nothing has been charged to you yet.'
					: 'This season is free to play. Nothing is being collected.'}
			</p>
		) : (
			<DuesBook
				book={uid ? [{ uid, ...mine, charged: mine.dues.reduce((total, due) => total + due.amount, 0) }] : []}
				usersByUid={usersByUid}
				labelFor={labelFor}
				canSettle={false}
				onSettle={onSettle}
				onDelete={onDelete}
			/>
		)}

		<HowToPay swish={fees.swish} outstanding={mine.outstanding} isAdmin={isAdmin} reference={reference} />
	</section>
);

/**
 * Raising the charges that ought to exist.
 *
 * An admin who has not set a fee has nothing to collect, so the sweep would
 * find nothing and say so cryptically. Point at the settings instead.
 */
const SweepPanel = ({
	show,
	collecting,
	fees,
	share,
	memberCount,
	missing,
	sweeping,
	onSweep,
}: {
	show: boolean;
	collecting: boolean;
	fees: SeasonFees;
	share: number;
	memberCount: number;
	missing: number | null;
	sweeping: boolean;
	onSweep: (raise: boolean) => void;
}) => {
	if (!show) return null;

	return (
		<section {...stylex.props(surfaces.glass, styles.sweep)}>
			<div>
				<h2 {...stylex.props(styles.sweepTitle)}>Raise the charges</h2>
				<p {...stylex.props(styles.sweepNote)}>
					{collecting
						? `${formatSek(fees.total)} for the season, ${formatSek(share)} each across ${memberCount} members. ${formatSek(fees.perGame)} per game for an extra who turned up, and nobody is charged for a game they were marked absent from.`
						: 'The season costs nothing and extras play free, so there is nothing to charge. Set the fees in the season settings first.'}
				</p>
			</div>

			{missing !== null && (
				<p {...stylex.props(styles.sweepCount)}>
					{missing === 0
						? 'Every charge that should exist already does.'
						: `${missing} ${missing === 1 ? 'charge is' : 'charges are'} missing.`}
				</p>
			)}

			<div {...stylex.props(styles.sweepActions)}>
				<Button variant='secondary' fullWidth disabled={!collecting} onClick={() => onSweep(false)}>
					Check what is missing
				</Button>
				<Button
					variant='primary'
					fullWidth
					loading={sweeping}
					disabled={!collecting || missing === null || missing === 0}
					onClick={() => onSweep(true)}
				>
					{missing ? `Raise ${missing}` : 'Raise'}
				</Button>
			</div>
		</section>
	);
};

/**
 * The season's paperwork.
 *
 * Between what somebody owes and what everybody owes, because it is the other
 * half of the first one: you paid for a season, and this is the piece of paper
 * that gets some of it back.
 */
const ReceiptsSection = ({
	seasonId,
	receipts,
	isAdmin,
	onUpload,
	onDownload,
	onCopyLink,
	onDelete,
}: {
	seasonId: string;
	receipts: Receipt[];
	isAdmin: boolean;
	onUpload: (file: File, name: string) => Promise<boolean>;
	onDownload: (receipt: Receipt) => Promise<void>;
	onCopyLink: (receipt: Receipt) => Promise<void>;
	onDelete: (receipt: Receipt) => void;
}) => (
	<section {...stylex.props(styles.group)}>
		<div {...stylex.props(styles.head)}>
			<SectionHeading>Receipts</SectionHeading>
			{receipts.length > 0 && <StatusPill tone='neutral'>{counted(receipts.length, 'file')}</StatusPill>}
		</div>

		<p {...stylex.props(styles.note)}>
			What to hand your employer if you claim friskv&aring;rdsbidrag. Tap one to look at it, or download your own
			copy. The link beside it opens this receipt for anybody in this season and for nobody else, so it is safe to
			paste into the group chat.
		</p>

		<ReceiptList
			seasonId={seasonId}
			receipts={receipts}
			canEdit={isAdmin}
			onUpload={onUpload}
			onDownload={onDownload}
			onCopyLink={onCopyLink}
			onDelete={onDelete}
		/>
	</section>
);

/**
 * The whole book, and the one button that chases everybody in it.
 *
 * The button sits over the list rather than under it. A season with enough
 * people owing to be worth one press is a book long enough that the button
 * would sit off the bottom of a phone, and it belongs to the names below it,
 * not to the panel further down about raising charges that do not exist yet.
 * Kept even when nobody owes, disabled, so the button an admin is looking for
 * does not move around on them.
 */
const WhoOwes = ({
	book,
	owing,
	usersByUid,
	labelFor,
	chasedAt,
	isAdmin,
	onSettle,
	onDelete,
	onRemind,
	onRemindEveryone,
}: {
	book: PlayerLedger[];
	owing: number;
	usersByUid: Map<string, AppUser>;
	labelFor: (due: Due) => string;
	chasedAt: Map<string, string>;
	isAdmin: boolean;
	onSettle: (due: Due, status: DueStatus) => void;
	onDelete: (due: Due) => void;
	onRemind: (player: PlayerLedger) => void;
	onRemindEveryone: () => void;
}) => (
	<section {...stylex.props(styles.group)}>
		<SectionHeading sx={styles.heading}>Who owes what</SectionHeading>

		{isAdmin && (
			<>
				<Button variant='secondary' fullWidth disabled={owing === 0} onClick={onRemindEveryone}>
					{owing === 0 ? 'Everybody is settled up' : `Remind all ${owing} who owe`}
				</Button>

				<p {...stylex.props(styles.note)}>
					A reminder names one person&apos;s own amount and links to this page, and says nothing about anybody
					else. There is no switch for it in their notification settings; paying is what stops it.
				</p>
			</>
		)}

		<DuesBook
			book={book}
			usersByUid={usersByUid}
			labelFor={labelFor}
			canSettle={isAdmin}
			chasedAt={chasedAt}
			onSettle={onSettle}
			onDelete={onDelete}
			onRemind={isAdmin ? onRemind : undefined}
		/>

		{!isAdmin && (
			<p {...stylex.props(styles.note)}>
				Only a season admin can mark a payment. Paying does not tick anything off by itself.
			</p>
		)}
	</section>
);

/**
 * Everything beyond somebody's own dues, which is the squad's business rather
 * than a guest's.
 *
 * An extra sees their own charges and what the group has bought, and no
 * collected total. Totalling a collection they cannot read would need a
 * function-owned summary document, which is a whole Cloud Function so that a
 * guest can see one number. Left out on purpose.
 */
const TheBook = ({
	viewer,
	terms,
	ledgers,
	hands,
	labelFor,
}: {
	viewer: Viewer;
	terms: Terms;
	ledgers: Ledgers;
	hands: Hands;
	labelFor: (due: Due) => string;
}) => {
	if (!viewer.squad) return null;

	// Counted off the book rather than the marks, so the button's number is the
	// one the admin can see in the list right above it. The send goes by the marks
	// either way, and the two disagree only for as long as a trigger runs.
	const owing = ledgers.book.filter(player => player.outstanding > 0).length;

	return (
		<>
			<ReceiptsSection
				seasonId={terms.season.id}
				receipts={ledgers.receipts}
				isAdmin={viewer.isAdmin}
				onUpload={hands.actions.uploadReceipt}
				onDownload={hands.download}
				onCopyLink={hands.copyLink}
				onDelete={hands.actions.removeReceipt}
			/>

			<WhoOwes
				book={ledgers.book}
				owing={owing}
				usersByUid={ledgers.usersByUid}
				labelFor={labelFor}
				chasedAt={ledgers.chasedAt}
				isAdmin={viewer.isAdmin}
				onSettle={hands.actions.settle}
				onDelete={hands.actions.removeDue}
				onRemind={hands.remind.one}
				onRemindEveryone={() => hands.remind.everyone(owing)}
			/>

			<SweepPanel
				show={viewer.isAdmin}
				collecting={terms.collecting}
				fees={terms.fees}
				share={entryShare(terms.fees.total, terms.season.memberUids.length)}
				memberCount={terms.season.memberUids.length}
				missing={hands.sweeper.missing}
				sweeping={hands.sweeper.sweeping}
				onSweep={hands.sweeper.sweep}
			/>
		</>
	);
};

/** The season's books, in the order somebody reads them. */
const Books = ({ viewer, terms, ledgers, hands }: { viewer: Viewer; terms: Terms; ledgers: Ledgers; hands: Hands }) => {
	const { season, games, fees, collecting } = terms;

	// Shared with the season's own debt notice, which names the same charges to
	// the person who owes them. It lives in `shared/finances.ts` because the two
	// screens would eventually disagree about the same line.
	const labelFor = (due: Due) => dueLabel(due, games, season.slot.timezone);

	return (
		<>
			{viewer.squad && <FinanceOverview summary={ledgers.summary} memberCount={season.memberUids.length} />}

			<YourDues
				uid={viewer.uid}
				mine={ledgers.mine}
				usersByUid={ledgers.usersByUid}
				labelFor={labelFor}
				collecting={collecting}
				fees={fees}
				isAdmin={viewer.isAdmin}
				reference={paymentReference(season.name, viewer.displayName)}
				onSettle={hands.actions.settle}
				onDelete={hands.actions.removeDue}
			/>

			<TheBook viewer={viewer} terms={terms} ledgers={ledgers} hands={hands} labelFor={labelFor} />

			<Bought
				expenses={ledgers.expenses}
				spent={ledgers.summary.extras.spent}
				isAdmin={viewer.isAdmin}
				onAdd={hands.actions.addExpense}
				onDelete={hands.actions.removeExpense}
			/>

			{!collecting && !viewer.isAdmin && (
				<EmptyState
					icon={<BanknotesIcon />}
					title='Nothing to pay'
					message='This season costs nothing to join and extras play free.'
				/>
			)}
		</>
	);
};

/**
 * What the season charges and who owes it.
 *
 * The reads behind this are all gated on being in the squad: the rules refuse an
 * extra the collection outright, so the app never asks for it.
 */
const useTerms = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin, isMember } = useSeasonContext();
	const { user } = useAuth();

	const uid = user?.uid ?? null;
	const squad = isMember || isAdmin;
	const { dues, loading: duesLoading } = useDues(seasonId, uid, squad);

	return {
		seasonId,
		season,
		games,
		dues,
		loading: loading || duesLoading,
		error,
		retry,
		viewer: { uid, displayName: user?.displayName ?? '', squad, isAdmin } satisfies Viewer,
	};
};

/** Everything else the screen reads, and everything it writes. */
const useLedgers = (seasonId: string, season: Season | null, games: Game[], dues: Due[], uid: string | null) => {
	const squadOnly = season !== null;
	const { usersByUid } = useUsersByUid();
	const { debtors } = useDebtors(seasonId, squadOnly);
	const { expenses } = useExpenses(seasonId);
	const { receipts } = useReceipts(seasonId, squadOnly);
	const { download, copyLink } = useReceiptActions(seasonId);

	const books = useBooks(season, dues, expenses, debtors, uid);

	return {
		ledgers: { ...books, receipts, expenses, usersByUid } satisfies Ledgers,
		hands: {
			actions: useBookActions(seasonId, uid ?? ''),
			remind: useChase(seasonId, usersByUid),
			sweeper: useSweep(seasonId, season, games),
			download,
			copyLink,
		} satisfies Hands,
	};
};

const FinancesPage = () => {
	const { seasonId, season, games, dues, loading, error, retry, viewer } = useTerms();
	const { ledgers, hands } = useLedgers(seasonId, season, games, dues, viewer.uid);

	const club = `/s/${seasonId}/members`;

	if (loading) return <NoBooks reason='loading' backHref={club} onRetry={retry} />;
	if (error) return <NoBooks reason='error' backHref={club} onRetry={retry} />;
	if (!season) return <NoBooks reason='missing' backHref={club} onRetry={retry} />;

	const fees = feesFor(season);

	return (
		<SeasonShell title='Finances' subtitle={season.name} backHref={club}>
			<div {...stylex.props(styles.page)}>
				<Books
					viewer={viewer}
					terms={{ season, games, fees, collecting: fees.total > 0 || fees.perGame > 0 }}
					ledgers={ledgers}
					hands={hands}
				/>
			</div>
		</SeasonShell>
	);
};

export default FinancesPage;
