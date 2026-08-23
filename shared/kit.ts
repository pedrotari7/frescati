/**
 * Who is bringing what, and what nobody is bringing.
 *
 * Everything here is **derived**, from the season's kit register and the
 * answers to one game, both of which the client already holds. There is no
 * stored `hasBall` counter and no trigger behind one, deliberately: `counts` on
 * the game document needs a function because a client cannot read everybody
 * else's response to tally it, and this needs nothing of the sort. A field that
 * could drift, plus a sweep to notice it had, would be machinery bought for a
 * question two arrays already answer.
 */

import type { GameResponse, KitItem, KitKind } from './types';

/** Display order. Every screen lists kinds in this order. */
export const KIT_KINDS: KitKind[] = ['ball', 'vests', 'other'];

/**
 * The kinds whose absence is worth interrupting somebody about.
 *
 * A gap is only ever reported against kit the group **owns**. A season with no
 * vests in the register is not short of vests. It is a group that plays skins
 * versus shirts, and nagging them weekly about a thing they have never had
 * would train everybody to ignore the one week the ball is genuinely stuck in a
 * hallway. You can only be missing something you have.
 */
export const REQUIRED_KIT_KINDS: KitKind[] = ['ball', 'vests'];

/** Heading case, for a section title. */
export const KIT_KIND_LABELS: Record<KitKind, string> = {
	ball: 'Ball',
	vests: 'Vests',
	other: 'Other kit',
};

/** Sentence case, for copy that reads "No ball" or "nobody has the vests". */
export const KIT_KIND_NOUNS: Record<KitKind, string> = {
	ball: 'ball',
	vests: 'vests',
	other: 'kit',
};

/**
 * Whether one kind of kit is coming to a game.
 *
 * `unknown` is the third state, and it exists for the same reason a missing
 * response document does: somebody who has not answered has not said no. The
 * two are worth telling apart because they need different things: `missing` is
 * a handover somebody has to arrange today, `unknown` is a person to chase for
 * an answer. And a register that shouted "NO BALL" every week until
 * the holder happened to tap In would be wrong far more often than it was
 * right.
 */
export type KitCoverage = 'covered' | 'unknown' | 'missing';

export interface KitKindStatus {
	kind: KitKind;
	coverage: KitCoverage;
	/** Every item of this kind the season owns, in list order. */
	items: KitItem[];
	/** The ones whose holder has said they are playing. Empty unless covered. */
	bringing: KitItem[];
}

/**
 * Kind first, then name, then id so the order is total. Two phones looking at
 * the same season have to list the same kit in the same order, and a Firestore
 * query promises nothing about the order documents arrive in.
 *
 * Sorted here rather than by the query because the order is kind-then-name,
 * which Firestore cannot do without a composite index for a collection that
 * holds five documents.
 */
export const sortKitItems = (items: KitItem[]): KitItem[] =>
	[...items].sort((a, b) => {
		if (a.kind !== b.kind) return KIT_KINDS.indexOf(a.kind) - KIT_KINDS.indexOf(b.kind);
		if (a.name !== b.name) return a.name.localeCompare(b.name);

		return a.id < b.id ? -1 : 1;
	});

/**
 * The register in the order every screen draws it, one entry per kind the
 * season actually owns something of.
 *
 * Kinds with nothing in them are left out rather than returned empty. A season
 * that has never had vests should not be rendering a Vests heading with nothing
 * under it, and should not be warned about them either. Same rule, one place.
 */
export const groupKitByKind = (items: KitItem[]): { kind: KitKind; items: KitItem[] }[] => {
	const sorted = sortKitItems(items);

	return KIT_KINDS.flatMap(kind => {
		const ofKind = sorted.filter(item => item.kind === kind);

		return ofKind.length === 0 ? [] : [{ kind, items: ofKind }];
	});
};

/**
 * What each kind of kit the season owns is doing about one game.
 *
 * The test is `status === 'in'` and nothing else, pointedly **not**
 * `isConfirmed`. Confirmation decides whether an extra counts towards the
 * headcount, which is a question about whether there are enough players; it
 * says nothing at all about whether the bag in somebody's hallway is going to
 * be at the pitch. A holder who has been dropped from the squad and answers as
 * an extra is still walking in with the vests.
 */
export const getKitStatus = (items: KitItem[], responses: Pick<GameResponse, 'uid' | 'status'>[]): KitKindStatus[] => {
	const answers = new Map(responses.map(response => [response.uid, response.status]));

	return groupKitByKind(items).map(({ kind, items: ofKind }) => {
		const bringing = ofKind.filter(item => answers.get(item.holderUid) === 'in');
		// `has`, not a truthy check on the status: the absence of the document is
		// the "no answer" state, and 'out' is an answer.
		const awaited = ofKind.some(item => !answers.has(item.holderUid));

		return {
			kind,
			items: ofKind,
			bringing,
			coverage: bringing.length > 0 ? 'covered' : awaited ? 'unknown' : 'missing',
		};
	});
};

/** The required kinds nobody has confirmed they're bringing. Empty is good news. */
export const getKitGaps = (statuses: KitKindStatus[]): KitKindStatus[] =>
	statuses.filter(status => REQUIRED_KIT_KINDS.includes(status.kind) && status.coverage !== 'covered');

/**
 * Kit held by somebody who is no longer in the squad.
 *
 * Reported rather than repaired, the same bargain `findCountsDrift` strikes: the
 * app has no idea who actually has the ball now, and quietly reassigning it to
 * the nearest admin would replace a visible problem with an invisible lie.
 * Removing a member is also not the moment to guess. The person who left may
 * well be dropping it back next week.
 *
 * The security rules only check the holder on the way **in**, so this is the
 * only thing that catches a roster that moved underneath a register that
 * didn't.
 */
export const findStrandedKit = (items: KitItem[], memberUids: string[]): KitItem[] => {
	const squad = new Set(memberUids);

	return sortKitItems(items).filter(item => !squad.has(item.holderUid));
};
