import { getAuth } from 'firebase-admin/auth';
import type {
	AppUser,
	Game,
	GameResponse,
	RatingLedgerEntry,
	Season,
	TournamentMatch,
	TournamentTeams,
} from '../../shared/types';
import { DEFAULT_BALANCE_SETTINGS, DEFAULT_NOTIFICATION_PREFS, EMPTY_COUNTS } from '../../shared/types';
import { db } from '../src/lib/firebase';

export const PROJECT_ID = 'demo-frescati';

const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

export const getDb = () => db;

/** Wipes every document. Cheap enough to run in every test's `beforeEach`. */
export const clearFirestore = async (): Promise<void> => {
	const response = await fetch(
		`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
		{ method: 'DELETE' }
	);
	if (!response.ok) throw new Error(`Could not clear the Firestore emulator: ${response.status}`);
};

export const clearAuth = async (): Promise<void> => {
	const response = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
		method: 'DELETE',
	});
	if (!response.ok) throw new Error(`Could not clear the Auth emulator: ${response.status}`);
};

/**
 * Creates a real Auth-emulator account. Needed wherever a function looks the
 * uid up through `getAuth()` — `setAppAdmin` most of all, which 404s a uid
 * with no account.
 */
export const createAuthUser = async (
	uid: string,
	{
		displayName = 'Test Player',
		email,
		admin = false,
	}: { displayName?: string; email?: string; admin?: boolean } = {}
): Promise<void> => {
	await getAuth().createUser({ uid, displayName, email: email ?? `${uid}@example.test` });
	if (admin) await getAuth().setCustomUserClaims(uid, { admin: true });
};

export const aSeason = (overrides: Partial<Season> = {}): Season => ({
	id: 'season-1',
	name: 'Autumn 2026',
	status: 'active',
	startDate: '2026-09-01',
	endDate: '2026-12-15',
	venue: { name: 'Frescati IP' },
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
	minPlayers: 10,
	responseDeadlineHours: 24,
	reminderHours: [72, 24],
	memberUids: [],
	adminUids: [],
	createdAt: '2026-08-01T00:00:00.000Z',
	createdBy: 'app-admin',
	...overrides,
});

export const writeSeason = async (seasonId: string, overrides: Partial<Season> = {}): Promise<Season> => {
	const season = aSeason({ ...overrides, id: seasonId });
	await db.doc(`seasons/${seasonId}`).set(season);
	return season;
};

export const aGame = (overrides: Partial<Game> = {}): Game => {
	const kickoff = overrides.kickoff ?? '2026-09-01T17:00:00.000Z';

	return {
		id: 'game-1',
		seasonId: 'season-1',
		kickoff,
		kickoffMillis: Date.parse(kickoff),
		endsAt: '2026-09-01T18:30:00.000Z',
		venue: { name: 'Frescati IP' },
		status: 'scheduled',
		isOneOff: false,
		counts: { ...EMPTY_COUNTS },
		atRisk: true,
		createdAt: '2026-08-01T00:00:00.000Z',
		createdBy: 'app-admin',
		...overrides,
	};
};

export const writeGame = async (seasonId: string, gameId: string, overrides: Partial<Game> = {}): Promise<Game> => {
	const game = aGame({ ...overrides, id: gameId, seasonId });
	await db.doc(`seasons/${seasonId}/games/${gameId}`).set(game);
	return game;
};

export const readGame = async (seasonId: string, gameId: string): Promise<Game | undefined> => {
	const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}`).get();
	return snapshot.exists ? (snapshot.data() as Game) : undefined;
};

export const readResponse = async (
	seasonId: string,
	gameId: string,
	uid: string
): Promise<GameResponse | undefined> => {
	const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}/responses/${uid}`).get();
	return snapshot.exists ? (snapshot.data() as GameResponse) : undefined;
};

export const aResponse = (uid: string, overrides: Partial<GameResponse> = {}): GameResponse => ({
	uid,
	status: 'in',
	role: 'member',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

export const writeResponse = async (
	seasonId: string,
	gameId: string,
	uid: string,
	overrides: Partial<GameResponse> = {}
): Promise<GameResponse> => {
	const response = aResponse(uid, overrides);
	await db.doc(`seasons/${seasonId}/games/${gameId}/responses/${uid}`).set(response);
	return response;
};

export const aUser = (uid: string, overrides: Partial<AppUser> = {}): AppUser => ({
	uid,
	displayName: 'Test Player',
	photoURL: null,
	createdAt: '2026-08-01T00:00:00.000Z',
	lastSeenAt: '2026-08-01T00:00:00.000Z',
	isAppAdmin: false,
	notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
	...overrides,
});

export const writeUser = async (uid: string, overrides: Partial<AppUser> = {}): Promise<AppUser> => {
	const user = aUser(uid, overrides);
	await db.doc(`users/${uid}`).set(user);
	return user;
};

export const readUser = async (uid: string): Promise<AppUser | undefined> => {
	const snapshot = await db.doc(`users/${uid}`).get();
	return snapshot.exists ? (snapshot.data() as AppUser) : undefined;
};

/**
 * A `DocumentSnapshot.data()`-shaped stand-in, for building the `before`/`after`
 * halves of an `onDocumentWritten` event by hand — the tests never go through
 * the real Functions emulator, so nothing else produces these for them.
 */
export const snap = <T>(data: T) => ({ data: () => data });

/**
 * Every exported Cloud Function carries a `.run()` that *is* the handler we
 * wrote — confirmed by reading the compiled `firebase-functions` package —
 * so a test can call it directly with only the fields the handler actually
 * reads, instead of standing up the Functions emulator for a real
 * `CloudEvent`. These build just enough of one, per trigger shape; the `any`
 * is the deliberate gap between that and the real, much larger event type.
 */
export const paramsEvent = (params: Record<string, string>) => ({ params }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const writtenEvent = (params: Record<string, string>, before: unknown, after: unknown) =>
	({ params, data: { before: snap(before), after: snap(after) } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const callRequest = (data: unknown, auth?: { uid: string; admin?: boolean }) =>
	({ data, auth: auth && { uid: auth.uid, token: { admin: auth.admin === true } } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const taskRequest = (data: unknown) => ({ data }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const writeTeams = async (
	seasonId: string,
	gameId: string,
	teams: string[][],
	overrides: Partial<TournamentTeams> = {}
): Promise<TournamentTeams> => {
	const lineup: TournamentTeams = {
		teams: teams.map((uids, index) => ({ index, uids })),
		elos: {},
		seed: 0,
		settings: DEFAULT_BALANCE_SETTINGS,
		generation: 1,
		builtAt: '2026-08-01T00:00:00.000Z',
		...overrides,
	};
	await db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`).set(lineup);
	return lineup;
};

export const readTeams = async (seasonId: string, gameId: string): Promise<TournamentTeams | undefined> => {
	const snapshot = await db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`).get();
	return snapshot.exists ? (snapshot.data() as TournamentTeams) : undefined;
};

export const writeMatch = async (
	seasonId: string,
	gameId: string,
	overrides: Partial<TournamentMatch> & { order: number; teamA: number; teamB: number }
): Promise<TournamentMatch> => {
	const match: TournamentMatch = {
		scoreA: 0,
		scoreB: 0,
		updatedBy: 'jest',
		updatedAt: new Date().toISOString(),
		...overrides,
	};
	await db.doc(`seasons/${seasonId}/games/${gameId}/matches/${match.order}`).set(match);
	return match;
};

export const readRatingLedger = async (gameId: string): Promise<RatingLedgerEntry | undefined> => {
	const snapshot = await db.doc(`ratingLedger/${gameId}`).get();
	return snapshot.exists ? (snapshot.data() as RatingLedgerEntry) : undefined;
};
