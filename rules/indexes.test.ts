import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The index set, checked against the queries that need it.
 *
 * Nothing else can catch this. The Firestore emulator answers any query put to
 * it, whether or not production has an index that could serve one, so every
 * suite in this repo passes against a query that fails in the real database
 * with `FAILED_PRECONDITION`, and the first anybody hears of it is a screen
 * that never loads. `firestore.indexes.json` is deployed config with no test
 * of its own and no compiler to answer to, which leaves tidying it up
 * indistinguishable from breaking it.
 *
 * So the queries are written out here beside the index each one rides on. The
 * list is by hand for the same reason the deployed-function list is: derived
 * from the file, it would agree with itself and assert nothing.
 *
 * Only queries that need a **composite** index are listed. Firestore maintains
 * single-field indexes automatically, which is what the rest of the app's
 * queries use, including the map-subfield read behind a player's record, whose
 * automatic index is exactly what the exemption test below protects.
 */

interface IndexField {
	fieldPath: string;
	order?: 'ASCENDING' | 'DESCENDING';
}

interface CompositeIndex {
	collectionGroup: string;
	queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
	fields: IndexField[];
}

interface FieldOverride {
	collectionGroup: string;
	fieldPath: string;
	indexes: { order?: string; arrayConfig?: string; queryScope: string }[];
}

const config = JSON.parse(readFileSync(join(__dirname, '..', 'firestore.indexes.json'), 'utf8')) as {
	indexes: CompositeIndex[];
	fieldOverrides: FieldOverride[];
};

/**
 * A query that cannot run on automatic indexes alone: an equality filter plus a
 * range or an ordering on some *other* field.
 */
interface Query {
	/** Where it lives, so a failure names the screen or sweep that stops working. */
	readonly where: string;
	readonly collectionGroup: string;
	readonly queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
	readonly fields: IndexField[];
}

const COMPOSITE_QUERIES: Query[] = [
	{
		where: 'auditCounts.ts: the nightly drift sweep, over upcoming games in one season',
		collectionGroup: 'games',
		queryScope: 'COLLECTION',
		fields: [
			{ fieldPath: 'status', order: 'ASCENDING' },
			{ fieldPath: 'kickoff', order: 'ASCENDING' },
		],
	},
	{
		where: 'sendReminders.ts: games inside a reminder window',
		collectionGroup: 'games',
		queryScope: 'COLLECTION',
		fields: [
			{ fieldPath: 'status', order: 'ASCENDING' },
			{ fieldPath: 'kickoff', order: 'ASCENDING' },
		],
	},
	{
		where: 'finaliseTournament.ts: games due to be auto-finalised, across every season',
		collectionGroup: 'games',
		queryScope: 'COLLECTION_GROUP',
		fields: [
			{ fieldPath: 'status', order: 'ASCENDING' },
			{ fieldPath: 'kickoff', order: 'ASCENDING' },
		],
	},
	{
		where: 'lib/data.ts: active seasons, newest first',
		collectionGroup: 'seasons',
		queryScope: 'COLLECTION',
		fields: [
			{ fieldPath: 'status', order: 'ASCENDING' },
			{ fieldPath: 'createdAt', order: 'DESCENDING' },
		],
	},
];

/**
 * Field order is part of the index, not incidental: an index on
 * (status, kickoff) cannot serve a query ordered the other way round.
 */
const sameFields = (left: IndexField[], right: IndexField[]): boolean =>
	left.length === right.length &&
	left.every(
		(field, position) => field.fieldPath === right[position].fieldPath && field.order === right[position].order
	);

const serves = (index: CompositeIndex, query: Query): boolean =>
	index.collectionGroup === query.collectionGroup &&
	index.queryScope === query.queryScope &&
	sameFields(index.fields, query.fields);

describe('the composite indexes', () => {
	it.each(COMPOSITE_QUERIES.map(query => [query.where, query] as const))('serve %s', (_where, query) => {
		expect(config.indexes.some(index => serves(index, query))).toBe(true);
	});

	it('declare nothing no query asks for', () => {
		// An index nobody reads is not free: every write to the collection pays
		// to maintain it. This is also the half that notices a query being
		// deleted without the index that was built for it.
		const orphans = config.indexes.filter(index => !COMPOSITE_QUERIES.some(query => serves(index, query)));

		expect(orphans).toEqual([]);
	});
});

describe("the collection-group read of one player's answers", () => {
	/**
	 * `useMyResponses` opens one collection-group listener for every answer the
	 * signed-in user has given, rather than a document listener per row of the
	 * games list. `onSeasonWrite` and `setStartingRating` read the same way.
	 *
	 * Collection-group scope is the part that has to be declared: it is not what
	 * an automatic single-field index gives you, and without it all three fail
	 * in production while passing everywhere here.
	 */
	const override = () =>
		config.fieldOverrides.find(entry => entry.collectionGroup === 'responses' && entry.fieldPath === 'uid');

	it('is indexed across every season', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' });
	});

	it('is still indexed within one game, which is how the roster is read', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
	});
});

describe('the sweep that closes a man-of-the-match vote', () => {
	/**
	 * `closeMotmVoting` asks every season at once, a collection-group range over
	 * `motmVotingUntilMillis`, which is a **single-field** query and still needs
	 * declaring, because automatic indexes are collection-scoped only.
	 *
	 * This was live in the project and missing from this file, which is the
	 * dangerous direction of drift rather than the harmless one: `firebase deploy
	 * --only firestore:indexes --force` deletes whatever the file does not
	 * mention, so the first deploy that included indexes would have taken the
	 * sweep's index out and left a vote nobody ever closes.
	 *
	 * Restating the three automatic entries is not padding. Declaring an override
	 * replaces the automatic configuration for that field outright, so a file
	 * naming only the group scope asks for the other three to be dropped.
	 */
	const override = () =>
		config.fieldOverrides.find(
			entry => entry.collectionGroup === 'games' && entry.fieldPath === 'motmVotingUntilMillis'
		);

	it('is indexed across every season', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' });
	});

	it('keeps the automatic indexes the override would otherwise replace', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
		expect(override()?.indexes).toContainEqual({ order: 'DESCENDING', queryScope: 'COLLECTION' });
		expect(override()?.indexes).toContainEqual({ arrayConfig: 'CONTAINS', queryScope: 'COLLECTION' });
	});
});

describe('the collection-group read of the games one player follows', () => {
	/**
	 * `subscribeToMyWatching` opens one collection-group listener for every game
	 * the signed-in user is following, which is what lets the season's home
	 * screen draw a bell on every row rather than a listener per row.
	 *
	 * The same declaration the answers above need, and it fails the same silent
	 * way without it. The emulator serves the query, production refuses it, and
	 * every bell on the calendar goes dark at once.
	 */
	const override = () =>
		config.fieldOverrides.find(entry => entry.collectionGroup === 'watchers' && entry.fieldPath === 'uid');

	it('is indexed across every game', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' });
	});

	// Nothing queries one game's watchers by field, `getWatcherUids` reads the
	// document ids, but an override listing only the group scope would *take
	// away* the automatic index rather than leave it alone, which is a thing to
	// do on purpose or not at all.
	it('leaves the automatic index within one game where it was', () => {
		expect(override()?.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
	});
});

describe("a player's record", () => {
	/**
	 * `/u/[uid]` is aggregated from the rating ledger by querying
	 * `positions.{uid}`, which rides Firestore's automatic map-subfield indexes:
	 * no composite index, no mirrored `uids` array.
	 *
	 * The cost of that is a landmine: `positions` holds one subfield per player
	 * who has ever played, so it is exactly the shape somebody reaches for a
	 * single-field exemption to tame. Adding one silently breaks every career
	 * screen, and nothing else in the repo would say so.
	 */
	it('is not disindexed by an exemption on positions', () => {
		const exemption = config.fieldOverrides.find(
			entry => entry.collectionGroup === 'ratingLedger' && entry.fieldPath.startsWith('positions')
		);

		expect(exemption).toBeUndefined();
	});

	it('is not disindexed by a wildcard exemption over the ledger', () => {
		// The other way to write the same mistake: `*` covers `positions` too.
		const wildcard = config.fieldOverrides.find(
			entry => entry.collectionGroup === 'ratingLedger' && entry.fieldPath === '*'
		);

		expect(wildcard).toBeUndefined();
	});
});
