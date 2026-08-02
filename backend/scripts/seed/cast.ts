/**
 * The people who turn up in a seeded database.
 *
 * `strength` is the one thing here that never reaches Firestore: it is the
 * player's *true* ability, used only to decide how the seeded matches go. The
 * ratings the app then shows are worked out from those results by the same code
 * the Cloud Functions run, so a seeded ladder is one the app could actually have
 * produced — not a column of made-up numbers that no result explains.
 *
 * Keep the list long. Scenarios pick from it, and a group of thirty gives the
 * four-team nights, the fringe members and the hopeful extras that the screens
 * are built for.
 */

export interface CastMember {
	/** Doubles as the uid (`dev-<key>`) and the local part of the email. */
	key: string;
	displayName: string;
	/** True ability, 0–1. Drives seeded scorelines; never stored. */
	strength: number;
	/** Some Google accounts have no picture, and the initials fallback has to be seen. */
	photo: boolean;
}

const person = (key: string, displayName: string, strength: number, photo = true): CastMember => ({
	key,
	displayName,
	strength,
	photo,
});

/**
 * Ordered roughly strongest first, purely so a scenario slicing the first N
 * people gets a plausible spread rather than an accidentally elite squad —
 * seasons deliberately interleave when they pick.
 */
export const CAST: CastMember[] = [
	person('pedro', 'Pedro Alvito', 0.72),
	person('anna', 'Anna Lindqvist', 0.81),
	person('mateo', 'Mateo Rossi', 0.78),
	person('johan', 'Johan Bergström', 0.55, false),
	person('yara', 'Yara Haddad', 0.74),
	person('viktor', 'Viktor Nilsson', 0.62),
	person('sofia', 'Sofia Moreau', 0.69),
	person('dimitri', 'Dimitri Petrov', 0.58, false),
	person('elena', 'Elena Marchetti', 0.65),
	person('omar', 'Omar Farouk', 0.71),
	person('lukas', 'Lukas Weber', 0.49),
	person('nina', 'Nina Kovács', 0.66),
	person('tobias', 'Tobias Ek', 0.44, false),
	person('priya', 'Priya Ramanathan', 0.73),
	person('marcus', 'Marcus Öberg', 0.52),
	person('hanna', 'Hanna Virtanen', 0.6),
	person('rafael', 'Rafael Duarte', 0.77),
	person('ingrid', 'Ingrid Solberg', 0.57, false),
	person('kwame', 'Kwame Mensah', 0.68),
	person('linnea', 'Linnéa Falk', 0.46),
	person('samir', 'Samir Benali', 0.63),
	person('greta', 'Greta Lund', 0.51),
	person('andrei', 'Andrei Popescu', 0.7, false),
	person('maja', 'Maja Sandberg', 0.42),
	person('felipe', 'Felipe Cardoso', 0.75),
	person('astrid', 'Astrid Holm', 0.54),
	person('tariq', 'Tariq Aziz', 0.61),
	person('wilma', 'Wilma Åkesson', 0.39, false),
	person('noah', 'Noah Lindgren', 0.67),
	person('claudia', 'Claudia Ferrer', 0.56),
	person('erik', 'Erik Sandström', 0.48),
	person('zoe', 'Zoë Papadopoulos', 0.64),
];

const BY_KEY = new Map(CAST.map(member => [member.key, member]));

export const castMember = (key: string): CastMember => {
	const member = BY_KEY.get(key);
	if (!member) throw new Error(`No such person in the cast: ${key}`);

	return member;
};

export const uidFor = (key: string): string => `dev-${key}`;

export const emailFor = (key: string): string => `${key}@frescati.dev`;

/**
 * The `sub` the emulator's Google provider link is keyed on. Signing in from
 * the browser sends this, the emulator matches it against the imported link and
 * hands back the same uid — which is the whole reason seeded data and a seeded
 * sign-in refer to the same person.
 */
export const googleSubFor = (key: string): string => `google-${uidFor(key)}`;

const AVATAR_HUES = [152, 199, 262, 21, 340, 96, 43, 288];

/**
 * The avatar's source, written into `frontend/public` by the seeder.
 *
 * Served from the app's own origin rather than fetched from an avatar service,
 * because the emulator is what you reach for on a train with no wifi — and
 * `Avatar` shows a broken image, not initials, when a remote URL fails to load.
 * A `data:` URI would have been better still, but Firebase Auth rejects one as
 * a `photoURL`, and the auth record is what the app copies onto the profile
 * every time somebody signs in.
 */
export const avatarPath = (member: CastMember): string | null =>
	member.photo ? `/dev-avatars/${member.key}.svg` : null;

export const avatarSvg = (member: CastMember): string => {
	const hue = AVATAR_HUES[member.key.charCodeAt(0) % AVATAR_HUES.length];
	const label = member.displayName
		.split(' ')
		.slice(0, 2)
		.map(part => part[0])
		.join('');

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`,
		`<rect width="64" height="64" fill="hsl(${hue} 55% 32%)"/>`,
		`<text x="32" y="42" font-family="system-ui,sans-serif" font-size="26" font-weight="600"`,
		` fill="hsl(${hue} 70% 88%)" text-anchor="middle">${label}</text>`,
		`</svg>`,
	].join('');
};
