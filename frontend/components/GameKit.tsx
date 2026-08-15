'use client';

import Link from 'next/link';
import { ChevronRightIcon, ExclamationTriangleIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import type { AppUser, GameResponse, KitItem } from '@shared/types';
import type { KitCoverage, KitKindStatus } from '@shared/kit';
import { KIT_KIND_LABELS, KIT_KIND_NOUNS, getKitGaps, getKitStatus } from '@shared/kit';
import { classNames } from '../lib/utils/reactHelper';
import type { PillTone } from './StatusPill';
import StatusPill from './StatusPill';

/**
 * Whether the ball and the vests are coming to this game.
 *
 * Worked out here from the register and the answers, both of which the caller
 * already holds — there is no counter on the game document and no trigger
 * behind one. See `shared/kit.ts` for why.
 *
 * Two shapes from one component so there is one wording rather than two that
 * drift: `compact` is the line on the next-game card, which renders **nothing**
 * at all when everything is covered, because that card is the one screen most
 * people ever look at and a green tick for kit is not what they opened the app
 * for. The full card on the game screen always draws, because somebody who has
 * scrolled that far is asking.
 */

const TONES: Record<KitCoverage, PillTone> = {
	covered: 'in',
	unknown: 'pending',
	missing: 'out',
};

/**
 * Who is bringing them, or who is holding the ones that aren't coming.
 *
 * A holder who has left the squad is named as such rather than dropped: they
 * are exactly the reason a required kind is uncovered, and a blank where a name
 * should be is the least useful thing this line could say.
 */
const holders = (items: KitItem[], usersByUid: Map<string, AppUser>): string =>
	items.map(item => usersByUid.get(item.holderUid)?.displayName ?? 'somebody who has left the squad').join(', ');

/**
 * The pill beside a row that has already said which kind it is, so this only
 * has to say what is happening to it. Tense-consistent across all three, and
 * across a required kind and a pump alike — "Missing" reads as *lost* rather
 * than *not coming tonight*, which is a different problem.
 */
const pillLabel = (coverage: KitCoverage): string =>
	coverage === 'covered' ? 'Coming' : coverage === 'unknown' ? 'Unconfirmed' : 'Not coming';

/**
 * The headline on the strip, where **nothing else names the kind** — so this
 * has to, in both states. It read "Nobody confirmed" once, which told somebody
 * glancing at the card that a thing was wrong without ever saying which thing.
 *
 * Only ever called for a gap, and `other` is never in one, so the labels this
 * reaches are "Ball" and "Vests".
 */
const gapLabel = (status: KitKindStatus): string =>
	status.coverage === 'missing' ? `No ${KIT_KIND_NOUNS[status.kind]}` : `${KIT_KIND_LABELS[status.kind]} unconfirmed`;

const detail = (status: KitKindStatus, usersByUid: Map<string, AppUser>): string => {
	if (status.coverage === 'covered') return holders(status.bringing, usersByUid);

	const many = status.items.length > 1;
	const who = `${holders(status.items, usersByUid)} ${many ? 'have them' : 'has it'}`;

	return status.coverage === 'missing'
		? `${who} and ${many ? "aren't" : "isn't"} playing`
		: `${who} and ${many ? "haven't" : "hasn't"} answered`;
};

const GameKit = ({
	seasonId,
	items,
	responses,
	usersByUid,
	compact = false,
}: {
	seasonId: string;
	items: KitItem[];
	responses: Pick<GameResponse, 'uid' | 'status'>[];
	usersByUid: Map<string, AppUser>;
	/** The one-line version for the next-game card. Silent when all is well. */
	compact?: boolean;
}) => {
	const statuses = getKitStatus(items, responses);
	const gaps = getKitGaps(statuses);

	// A season with nothing in the register has nothing to say on either screen,
	// and neither has a covered game on the hero.
	if (statuses.length === 0 || (compact && gaps.length === 0)) return null;

	if (compact) {
		// Red when something genuinely isn't coming, amber when it is only
		// unconfirmed. One strip covers both at once — a missing ball alongside
		// unconfirmed vests is a red situation, so the worse of the two wins.
		const severe = gaps.some(status => status.coverage === 'missing');

		return (
			<Link
				href={`/s/${seasonId}/kit`}
				className={classNames(
					'mt-4 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors',
					severe
						? 'border-out/30 bg-out/8 hover:bg-out/12'
						: 'border-pending/25 bg-pending/8 hover:bg-pending/12'
				)}
			>
				<ExclamationTriangleIcon
					className={classNames('size-4 shrink-0', severe ? 'text-out' : 'text-pending')}
					aria-hidden='true'
				/>

				{/* One line per gap rather than two joined lists — there are at
				    most two, and "No ball · Vests unconfirmed" over "Anna has it
				    and isn't playing · Pedro has them and hasn't answered" makes
				    the reader pair them up by position. */}
				<ul className='min-w-0 flex-1 space-y-0.5'>
					{gaps.map(status => (
						<li key={status.kind} className='truncate text-xs'>
							<span className='text-ink font-semibold'>{gapLabel(status)}</span>
							<span className='text-faint'> — {detail(status, usersByUid)}</span>
						</li>
					))}
				</ul>

				<ChevronRightIcon className='text-faint size-4 shrink-0' aria-hidden='true' />
			</Link>
		);
	}

	return (
		<section className='glass rounded-2xl p-4'>
			<div className='mb-3 flex items-center justify-between gap-2'>
				<div className='flex min-w-0 items-center gap-2'>
					<ShoppingBagIcon className='text-brand size-4 shrink-0' aria-hidden='true' />
					<h2 className='text-ink text-sm font-semibold'>Kit</h2>
				</div>

				<Link href={`/s/${seasonId}/kit`} className='text-faint hover:text-ink shrink-0 text-xs'>
					Who has what
				</Link>
			</div>

			<ul className='divide-y divide-white/5'>
				{statuses.map(status => (
					<li
						key={status.kind}
						className='flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0'
					>
						<div className='min-w-0'>
							<p className='text-ink text-sm'>{KIT_KIND_LABELS[status.kind]}</p>
							<p className='text-faint mt-0.5 text-xs'>{detail(status, usersByUid)}</p>
						</div>

						<StatusPill tone={TONES[status.coverage]}>{pillLabel(status.coverage)}</StatusPill>
					</li>
				))}
			</ul>
		</section>
	);
};

export default GameKit;
