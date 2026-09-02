'use client';

import Link from 'next/link';
import { ChevronRightIcon, ExclamationTriangleIcon, ShoppingBagIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, GameResponse, KitItem } from '@shared/types';
import type { KitCoverage, KitKindStatus } from '@shared/kit';
import { KIT_KIND_LABELS, KIT_KIND_NOUNS, getKitGaps, getKitStatus } from '@shared/kit';
import type { PillTone } from './StatusPill';
import StatusPill from './StatusPill';
import { bp, colors, tint } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';

/**
 * Whether the ball and the vests are coming to this game.
 *
 * Worked out here from the register and the answers, both of which the caller
 * already holds, there is no counter on the game document and no trigger
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

const styles = stylex.create({
	strip: {
		marginTop: 16,
		display: 'flex',
		alignItems: 'center',
		gap: 10,
		borderRadius: 16,
		borderWidth: 1,
		borderStyle: 'solid',
		paddingInline: 12,
		paddingBlock: 10,
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	severe: {
		borderColor: tint.out30,
		backgroundColor: { default: tint.out8, [bp.hover]: { default: null, ':hover': tint.out12 } },
	},
	unsure: {
		borderColor: tint.pending25,
		backgroundColor: { default: tint.pending8, [bp.hover]: { default: null, ':hover': tint.pending12 } },
	},
	warnIcon: { width: 16, height: 16, flexShrink: 0 },
	warnSevere: { color: colors.out },
	warnUnsure: { color: colors.pending },

	gaps: { minWidth: 0, flexGrow: 1, flexBasis: '0%', display: 'flex', flexDirection: 'column', gap: 2 },
	gap: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, lineHeight: '16px' },
	gapLead: { color: colors.ink, fontWeight: 600 },
	gapRest: { color: colors.faint },
	chevron: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },

	card: { borderRadius: 16, padding: 16 },
	head: { marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	headLeft: { display: 'flex', minWidth: 0, alignItems: 'center', gap: 8 },
	bagIcon: { color: colors.brand, width: 16, height: 16, flexShrink: 0 },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	more: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.ink } },
		flexShrink: 0,
		fontSize: 12,
		lineHeight: '16px',
	},

	/* A divider between rows and none above the first, which is `divide-y`. */
	row: {
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		display: 'flex',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: 12,
		paddingTop: { default: 10, ':first-child': 0 },
		paddingBottom: { default: 10, ':last-child': 0 },
	},
	kind: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	who: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
});

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
 * across a required kind and a pump alike: "Missing" reads as *lost* rather
 * than *not coming to this game*, which is a different problem.
 */
const pillLabel = (coverage: KitCoverage): string =>
	coverage === 'covered' ? 'Coming' : coverage === 'unknown' ? 'Unconfirmed' : 'Not coming';

/**
 * The headline on the strip, where **nothing else names the kind**, so this
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
		// unconfirmed. One strip covers both at once, a missing ball alongside
		// unconfirmed vests is a red situation, so the worse of the two wins.
		const severe = gaps.some(status => status.coverage === 'missing');

		return (
			<Link href={`/s/${seasonId}/kit`} {...stylex.props(styles.strip, severe ? styles.severe : styles.unsure)}>
				<ExclamationTriangleIcon
					{...stylex.props(styles.warnIcon, severe ? styles.warnSevere : styles.warnUnsure)}
					aria-hidden='true'
				/>

				{/* One line per gap rather than two joined lists, there are at
				    most two, and "No ball · Vests unconfirmed" over "Anna has it
				    and isn't playing · Pedro has them and hasn't answered" makes
				    the reader pair them up by position. */}
				<ul {...stylex.props(styles.gaps)}>
					{gaps.map(status => (
						<li key={status.kind} {...stylex.props(styles.gap)}>
							<span {...stylex.props(styles.gapLead)}>{gapLabel(status)}</span>
							<span {...stylex.props(styles.gapRest)}> · {detail(status, usersByUid)}</span>
						</li>
					))}
				</ul>

				<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
			</Link>
		);
	}

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<div {...stylex.props(styles.headLeft)}>
					<ShoppingBagIcon {...stylex.props(styles.bagIcon)} aria-hidden='true' />
					<h2 {...stylex.props(styles.title)}>Kit</h2>
				</div>

				<Link href={`/s/${seasonId}/kit`} {...stylex.props(styles.more)}>
					Who has what
				</Link>
			</div>

			<ul>
				{statuses.map(status => (
					<li key={status.kind} {...stylex.props(styles.row)}>
						<div {...stylex.props(styles.gaps)}>
							<p {...stylex.props(styles.kind)}>{KIT_KIND_LABELS[status.kind]}</p>
							<p {...stylex.props(styles.who)}>{detail(status, usersByUid)}</p>
						</div>

						<StatusPill tone={TONES[status.coverage]}>{pillLabel(status.coverage)}</StatusPill>
					</li>
				))}
			</ul>
		</section>
	);
};

export default GameKit;
