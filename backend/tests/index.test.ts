import * as deployed from '../src/index';
import { EMAIL_SECRETS } from '../src/lib/email';
import { REGION } from '../src/lib/firebase';

/**
 * What actually gets deployed.
 *
 * Every other file in here imports the function it tests straight from its own
 * module, which means none of them touch `src/index.ts`, so a function that
 * exists, works and is exhaustively tested still deploys nowhere if it is
 * missing from the export list, and the whole suite stays green while it does.
 * That is the one failure this file exists to catch, and it is invisible
 * everywhere else: `firebase deploy` simply never hears about the function.
 *
 * The rest is the wiring nothing else can see either. A handler is tested by
 * calling `.run()` with a hand-built event, which says nothing about *when* the
 * real one fires: the document path, the schedule and the region live in the
 * trigger options, are read only by the deploy manifest, and would take a
 * deploy to disprove. `__endpoint` is that manifest, so these read it directly.
 */

/** Only the parts of the deploy manifest these tests read. */
interface Endpoint {
	region?: string[];
	secretEnvironmentVariables?: { key: string }[];
	eventTrigger?: {
		eventType: string;
		eventFilterPathPatterns?: { document?: string };
		retry: boolean;
	};
	scheduleTrigger?: { schedule: string; timeZone?: string };
	callableTrigger?: object;
	taskQueueTrigger?: object;
	httpsTrigger?: object;
}

const functions = deployed as unknown as Record<string, { __endpoint?: Endpoint }>;

const endpointOf = (name: string): Endpoint => {
	const endpoint = functions[name]?.__endpoint;
	if (!endpoint) throw new Error(`${name} is not exported from src/index.ts`);

	return endpoint;
};

/**
 * Every function this backend deploys.
 *
 * Written out rather than derived, because deriving it from the exports would
 * make the list agree with itself and assert nothing. Adding a function means
 * adding a line here, deliberately, that step *is* the check.
 */
const DEPLOYED = [
	'auditGameCounts',
	'calendarFeed',
	'closeMotmVoting',
	'finaliseDueTournaments',
	'finaliseTournament',
	'getCalendarLink',
	'getGameWatchers',
	'getPushDevices',
	'onBudgetAlert',
	'onDueWrite',
	'onGameDeleted',
	'onGameWrite',
	'onMatchWrite',
	'onMotmVoteWrite',
	'onResponseWrite',
	'onSeasonDeleted',
	'onSeasonWrite',
	'onUserCreated',
	'rebuildTeams',
	'rotateCalendarToken',
	'sendReminders',
	'sendTestEmail',
	'sendTestPush',
	'setAppAdmin',
	'setPlayerTeam',
	'setStartingRating',
	'setTeamLetter',
	'throwTestError',
];

/**
 * Which document each Firestore trigger watches, spelled out against the data
 * model rather than read back off the code.
 *
 * A path is the one thing about a trigger that can be wrong in a way no
 * handler test can reach: point `onResponseWrite` at a collection nobody writes
 * and every assertion about counting responses still passes, against an event
 * that will never arrive.
 */
const WATCHES: Record<string, { eventType: 'created' | 'written' | 'deleted'; document: string }> = {
	onUserCreated: { eventType: 'created', document: 'users/{uid}' },
	onSeasonWrite: { eventType: 'written', document: 'seasons/{seasonId}' },
	onSeasonDeleted: { eventType: 'deleted', document: 'seasons/{seasonId}' },
	onGameWrite: { eventType: 'written', document: 'seasons/{seasonId}/games/{gameId}' },
	onGameDeleted: { eventType: 'deleted', document: 'seasons/{seasonId}/games/{gameId}' },
	onResponseWrite: { eventType: 'written', document: 'seasons/{seasonId}/games/{gameId}/responses/{uid}' },
	onMatchWrite: { eventType: 'written', document: 'seasons/{seasonId}/games/{gameId}/matches/{order}' },
	onMotmVoteWrite: { eventType: 'written', document: 'seasons/{seasonId}/games/{gameId}/motmVotes/{uid}' },
	onDueWrite: { eventType: 'written', document: 'seasons/{seasonId}/dues/{dueId}' },
};

/** The sweeps, and how often each is expected to come round. */
const SWEEPS: Record<string, string> = {
	sendReminders: 'every 60 minutes',
	finaliseDueTournaments: 'every 1 hours',
	closeMotmVoting: 'every 1 hours',
	auditGameCounts: 'every 24 hours',
};

/**
 * Everything that can end up sending an email.
 *
 * `sendPush` falls back to email for anybody it reached no device for, so the
 * secret has to be declared by whatever *triggers* a notification, not just by
 * the code that sends one. Undeclared, the fallback silently mails nobody.
 * Push still works, so nothing looks broken from the inside.
 */
const REACHES_EMAIL = [
	'closeMotmVoting',
	'finaliseDueTournaments',
	'finaliseTournament',
	'onGameWrite',
	'onResponseWrite',
	'onUserCreated',
	'sendReminders',
	'sendTestEmail',
	'sendTestPush',
];

describe('the deployed surface', () => {
	it('exports exactly the functions this backend means to deploy', () => {
		expect(Object.keys(functions).sort()).toEqual([...DEPLOYED].sort());
	});

	it('gives every one of them a trigger', () => {
		// A bare export with no endpoint is a value that got re-exported by
		// mistake, and `firebase deploy` fails on it rather than skipping it.
		for (const name of DEPLOYED) expect(endpointOf(name)).toBeTruthy();
	});

	it('pins every function to the region the database is in', () => {
		// `setGlobalOptions` in src/index.ts is the only thing setting this, and
		// a function in the wrong region reads its own Firestore across a
		// continent, or, for the triggers, is refused at deploy.
		for (const name of DEPLOYED) expect(endpointOf(name).region).toEqual([REGION]);
	});
});

describe('the Firestore triggers', () => {
	it.each(Object.entries(WATCHES))('%s watches the right document', (name, { eventType, document }) => {
		const { eventTrigger } = endpointOf(name);

		expect(eventTrigger?.eventType).toBe(`google.cloud.firestore.document.v1.${eventType}`);
		expect(eventTrigger?.eventFilterPathPatterns?.document).toBe(document);
	});

	it('covers every Firestore trigger that is deployed', () => {
		// Otherwise a new trigger on a new collection is wired by nobody: the
		// table above only checks the paths it already knows about.
		const triggers = DEPLOYED.filter(name =>
			endpointOf(name).eventTrigger?.eventType.startsWith('google.cloud.firestore.')
		);

		expect(triggers.sort()).toEqual(Object.keys(WATCHES).sort());
	});
});

describe('the scheduled sweeps', () => {
	it.each(Object.entries(SWEEPS))('%s runs %s', (name, schedule) => {
		expect(endpointOf(name).scheduleTrigger?.schedule).toBe(schedule);
	});

	it('covers every sweep that is deployed', () => {
		const scheduled = DEPLOYED.filter(name => endpointOf(name).scheduleTrigger);

		expect(scheduled.sort()).toEqual(Object.keys(SWEEPS).sort());
	});
});

describe('the email secret', () => {
	const declared = (name: string): string[] =>
		(endpointOf(name).secretEnvironmentVariables ?? []).map(secret => secret.key);

	// Read off the real definition rather than written out, so renaming the
	// secret can't leave this passing against a name nothing uses any more.
	const expected = EMAIL_SECRETS.map(secret => secret.name);

	it.each(REACHES_EMAIL)('%s declares it, because its push can fall back to email', name => {
		expect(declared(name)).toEqual(expected);
	});

	it('is declared by nothing else', () => {
		// A secret on a function that sends nothing is one more thing that must
		// exist in Secret Manager before any deploy of any function succeeds.
		const holders = DEPLOYED.filter(name => declared(name).length > 0);

		expect(holders.sort()).toEqual([...REACHES_EMAIL].sort());
	});
});
