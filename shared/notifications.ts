import type { AvailabilityChange, NotificationPrefs } from './types';
import { MOTM_VOTING_HOURS } from './motm';
import { counted, formatSek } from './format';

/**
 * Every notification the app sends, built in one place.
 *
 * The payloads used to be written inline at each trigger, which was fine until
 * something needed to send one on purpose. A debug screen composing its own
 * copies would be a test of the copies, not of what players actually receive.
 * Same reasoning as the seeder deriving its data from `shared/` rather than
 * hand-writing it.
 *
 * Email is the same copy in a different envelope: `buildEmail` takes the push
 * payload a trigger already built rather than the kind and context it was built
 * from, so there is exactly one place a wording lives and no second channel to
 * keep in step.
 */

export interface PushPayload {
	title: string;
	body: string;
	/** Deep link opened on tap. */
	url: string;
	/** Notifications sharing a tag replace each other instead of stacking. */
	tag: string;
	/**
	 * Whether the service worker's "I'm in" shortcut belongs on this one. Only a
	 * game has something to say yes to; offering it on an admin notice about
	 * somebody signing up would open the app and then silently do nothing.
	 */
	respondable: boolean;
}

/** The events worth interrupting somebody for. */
export type GameNotification =
	| 'cancelled'
	| 'restored'
	| 'atRisk'
	| 'kickoffMoved'
	| 'reminder'
	| 'availability'
	| 'motm'
	| 'motmResult';

export const GAME_NOTIFICATIONS: GameNotification[] = [
	'reminder',
	'atRisk',
	'cancelled',
	'restored',
	'kickoffMoved',
	'availability',
	'motm',
	'motmResult',
];

/**
 * Notifications about the app itself rather than about one game. These go to
 * app admins only, because there is nobody else they would mean anything to.
 */
export type AppNotification = 'newPlayer';

const APP_NOTIFICATIONS: AppNotification[] = ['newPlayer'];

/**
 * Notifications about a season's books rather than about one of its games.
 *
 * Its own category because neither of the two above fits. A game notification
 * carries a kick-off and a headcount and deep-links to a game; an app one goes
 * to every admin about the app itself. This goes to one named person about what
 * they owe one season, and it is the first thing the app sends that an admin
 * aims by hand rather than a trigger firing on an event.
 */
export type SeasonNotification = 'duesReminder';

const SEASON_NOTIFICATIONS: SeasonNotification[] = ['duesReminder'];

/** Every kind the app can send. */
export type AnyNotification = GameNotification | AppNotification | SeasonNotification;

/** Everything the app can send, for anywhere that has to cover all of it. */
export const NOTIFICATIONS: AnyNotification[] = [...GAME_NOTIFICATIONS, ...APP_NOTIFICATIONS, ...SEASON_NOTIFICATIONS];

export interface GameNotificationContext {
	/** Kick-off, already formatted in the season's timezone. */
	when: string;
	/** Deep link to the game. */
	url: string;
	gameId: string;
	/** `cancelled` only, and optional there, since an admin needn't give a reason. */
	cancelledReason?: string;
	/** `atRisk` only: how many more players the game needs. */
	shortBy?: number;
	/** `reminder` and `availability`: how many have said yes so far. */
	playing?: number;
	/** `availability` only: whose answer moved. Empty falls back to "Somebody". */
	who?: string;
	/** `availability` only: what they moved it to. */
	availability?: AvailabilityChange;
	/**
	 * `motmResult` only: who the group picked, by display name rather than uid,
	 * because this is the one payload whose subject isn't the person reading it.
	 * More than one is a tie, which is a real outcome. See `MotmTally`.
	 */
	winners?: string[];
	/**
	 * `motmResult` only: how many votes the winners got. One number covers a tie,
	 * since everybody level on the most votes is level by construction.
	 */
	votes?: number;
}

/**
 * Which preference silences each kind, or `null` for one the profile has no say
 * over.
 *
 * Paired with the payload here rather than passed alongside it at the call
 * site, where a cancellation sent under `reminders` would look perfectly
 * reasonable and reach people who had switched cancellations off.
 *
 * `null` is not "ungated". Every other kind here goes to a standing audience
 * nobody signed up for: the season roster, everyone who answered, every app
 * admin. A switch on the profile is the only place to say no to those.
 * `availability` goes only to people who followed one specific game, and
 * following is off by default; unfollowing is the switch, and it is one tap
 * from the notification itself. A second one on the profile would be a setting
 * that means nothing until you have already opted in somewhere else. That is
 * why `relevantPrefs` below hides `newPlayers` from everybody but an admin.
 */
export const NOTIFICATION_PREF: Record<AnyNotification, keyof NotificationPrefs | null> = {
	cancelled: 'gameChanges',
	restored: 'gameChanges',
	atRisk: 'gameChanges',
	kickoffMoved: 'gameChanges',
	reminder: 'reminders',
	newPlayer: 'newPlayers',
	motm: 'motm',
	// The answer shares the question's switch rather than earning one of its own.
	// A kind needs a switch when it goes to a standing audience, which this does.
	// But it goes to *the same* standing audience, about the same vote, as the
	// half that asked. Somebody who wanted to be asked wants to hear how it went,
	// and somebody who muted being asked has already said they don't. A second
	// switch would only offer the two settings nobody wants: to be canvassed and
	// never told, or told about a vote you were never invited to.
	motmResult: 'motm',
	availability: null,
	// Settling up is the switch. The second kind with none, and it gets there a
	// different way from `availability`. That one is opted into somewhere more
	// specific; this one cannot be opted out of at all while it is still true.
	//
	// The test above is whether a kind goes to a standing audience nobody signed
	// up for, and on that test this would qualify. What it fails is the other
	// half of the sentence. Every kind with a switch is sent by a trigger to a
	// list of people, and a switch is how one of them steps off the list. This is
	// aimed at one named person by an admin who has looked at the books, about a
	// fact that only exists while they owe money, and there is exactly one way to
	// make it stop, which is to pay or to have the charge written off. A profile
	// switch would be the app offering to silence the thing it is already
	// stopping you signing up over, and the admin who pressed the button would
	// have no way to tell the notification was dropped.
	//
	// `emailFallback` still applies, as it does for `availability`. That one
	// picks a channel rather than a kind. Somebody who wants no mail from
	// Frescati wants none about money either, and the push still goes.
	duesReminder: null,
};

/**
 * Which switches on a profile mean anything for this person.
 *
 * `newPlayers` only ever goes to app admins, so for everybody else it is a
 * setting with nothing behind it. Counting it would report a player as partly
 * muted for turning off something they were never going to get.
 *
 * `emailFallback` is deliberately absent: it picks a channel rather than a kind,
 * and counting it here would report somebody who wants push and nothing else as
 * partly muted.
 */
export const relevantPrefs = (isAppAdmin: boolean): (keyof NotificationPrefs)[] =>
	isAppAdmin ? ['reminders', 'gameChanges', 'motm', 'newPlayers'] : ['reminders', 'gameChanges', 'motm'];

/**
 * Why nothing is arriving, for the three reasons that aren't a bug.
 *
 * `noDevice` beats `muted` deliberately: preferences are academic until
 * something is registered to send to, and telling somebody to check their
 * settings when they have never turned notifications on sends them looking in
 * the wrong place.
 */
export type PushReach = 'reachable' | 'partly' | 'muted' | 'noDevice';

export const getPushReach = ({
	prefs,
	devices,
	isAppAdmin,
}: {
	prefs?: NotificationPrefs;
	/** How many devices are registered to the account. */
	devices: number;
	isAppAdmin: boolean;
}): PushReach => {
	if (devices === 0) return 'noDevice';

	const relevant = relevantPrefs(isAppAdmin);
	// Absent means opted in, matching `tokensFor` on the backend. A profile
	// written before a preference existed must not read as switched off.
	const on = relevant.filter(key => prefs?.[key] !== false);

	if (on.length === 0) return 'muted';

	return on.length === relevant.length ? 'reachable' : 'partly';
};

/**
 * Whether email would carry something a push could not.
 *
 * Needs an address to send to and the switch left on. Like every preference
 * here, absent means opted in. Kept separate from `getPushReach` rather than
 * folded into it because the two answer different questions. That one is about
 * a channel this person may not want, and a screen that conflated them could no
 * longer say *which* of the two is silent.
 *
 * Says nothing about the kinds. A cancellation still needs `gameChanges` on;
 * this only decides how it travels once it's going out at all.
 */
export const canEmail = ({ prefs, hasEmail }: { prefs?: NotificationPrefs; hasEmail: boolean }): boolean =>
	hasEmail && prefs?.emailFallback !== false;

/**
 * Exactly the five switches, whatever came in.
 *
 * Every writer used to spread the stored map forward: `{ ...defaults,
 * ...profile?.notificationPrefs }` on the settings screen, and the stored value
 * verbatim on sign-in. Fine while the only things writing it were those two,
 * and not fine as a rule. Security rules now bound this map to these five keys,
 * so a profile that had somehow acquired a sixth would have had every
 * subsequent write to it rejected. Its owner could not save a preference, and
 * their sign-in profile sync failed quietly behind a `.catch`.
 *
 * Picking the keys out explicitly rather than spreading is what makes "the
 * client only ever writes the five" true by construction instead of by luck.
 *
 * Missing becomes `true`, matching how every reader treats an absent key: the
 * defaults are on, and a preference nobody has expressed is not an opt-out.
 */
export const normaliseNotificationPrefs = (prefs?: Partial<NotificationPrefs>): NotificationPrefs => ({
	reminders: prefs?.reminders !== false,
	gameChanges: prefs?.gameChanges !== false,
	newPlayers: prefs?.newPlayers !== false,
	motm: prefs?.motm !== false,
	emailFallback: prefs?.emailFallback !== false,
});

type Copy = (context: GameNotificationContext) => { title: string; body: string };

/**
 * How each move reads in a title. `withdrawn` says what happened rather than
 * what the answer now is, because there is no longer an answer to state.
 */
const AVAILABILITY_COPY: Record<AvailabilityChange, string> = {
	in: 'is in',
	out: 'is out',
	withdrawn: 'took their answer back',
};

/**
 * "Anders", "Anders and Björn", "Anders, Björn and Chris".
 *
 * Only a tie ever brings more than one name here, and a tie between more than
 * two is rare. But a vote of one, two or three all being level is exactly the
 * shape a small turnout takes, so this handles the list rather than the pair.
 */
const formatNames = (names: string[]): string => {
	// A blank is a profile caught mid-write rather than somebody to leave out.
	// See `getDisplayName`. Dropping it would turn a tie into a title claiming a
	// single winner, which is the one thing here that reads as wrong rather than
	// as missing.
	const named = names.map(name => name.trim() || 'Somebody');

	return named.length <= 1 ? (named[0] ?? '') : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
};

const COPY: Record<GameNotification, Copy> = {
	cancelled: ({ when, cancelledReason }) => ({
		title: 'Game called off',
		body: cancelledReason ? `${when} is off: ${cancelledReason}` : `${when} is off.`,
	}),

	restored: ({ when }) => ({
		title: 'Game back on',
		body: `${when} is on again. Are you in?`,
	}),

	atRisk: ({ when, shortBy }) => ({
		title: 'Short of players',
		body: `${when} needs ${Math.max(0, shortBy ?? 0)} more. Can you make it?`,
	}),

	kickoffMoved: ({ when }) => ({
		title: 'Kick-off moved',
		body: `The game has moved to ${when}.`,
	}),

	reminder: ({ when, playing }) => ({
		title: 'Are you playing?',
		body: `${when}. ${playing ?? 0} in so far.`,
	}),

	// The name is the whole notification, so it goes in the title where a lock
	// screen will not truncate it. Defaults for both halves because this is the
	// first copy here that interpolates anything required, and the debug screen
	// renders a title from an empty context. "Somebody is in" is a fair
	// stand-in, where `undefined is in` would be the drift that comment warns
	// about.
	availability: ({ when, who, availability, playing }) => ({
		title: `${who?.trim() || 'Somebody'} ${AVAILABILITY_COPY[availability ?? 'in']}`,
		body: `${when}. ${playing ?? 0} in so far.`,
	}),

	// Arrives after the football rather than before it, so the date is what
	// places it. "Which Tuesday is this about" is a real question two days
	// later, and the same goes for the result below.
	motm: ({ when }) => ({
		title: 'Who was man of the match?',
		body: `${when}. Pick whoever stood out. Voting closes in ${MOTM_VOTING_HOURS} hours.`,
	}),

	// The other half of that exchange, and the only thing the app sends that is
	// purely news: nothing to answer, nobody to bring a ball. It is here because
	// everybody in the lineup was interrupted to vote and the result otherwise
	// reached them only if they happened to open the app again. A question asked
	// and never answered back is the kind people stop replying to.
	//
	// The name goes in the title for the same reason `availability` puts one
	// there: it is the whole notification, and the body is what a lock screen
	// truncates. `votes` is in the body because how close it was is the first
	// thing anybody asks next, and it is what makes the tap worth it.
	motmResult: ({ when, winners = [], votes = 0 }) => ({
		title:
			winners.length > 1
				? `${formatNames(winners)} share man of the match`
				: `${formatNames(winners) || 'Somebody'} is man of the match`,
		body: `${when}. ${votes} ${votes === 1 ? 'vote' : 'votes'}${winners.length > 1 ? ' each' : ''}.`,
	}),
};

/**
 * The kinds that arrive after the football rather than before it.
 *
 * The service worker's "I'm in" shortcut belongs on a notification asking a
 * question somebody can still answer, and by the time either of these lands
 * there is nothing left to be in for. The button would open the app and do
 * nothing. A list rather than a `!== 'motm'` because the vote stopped being the
 * only one the moment its result was sent too, and the next post-game kind
 * added here should not have to rediscover that.
 */
const AFTER_THE_GAME: GameNotification[] = ['motm', 'motmResult'];

export const buildGamePush = (kind: GameNotification, context: GameNotificationContext): PushPayload => ({
	...COPY[kind](context),
	url: context.url,
	// One tag per game, so three notifications about the same Tuesday replace
	// each other on the lock screen instead of stacking up.
	tag: `game-${context.gameId}`,
	respondable: !AFTER_THE_GAME.includes(kind),
});

export interface NewPlayerContext {
	uid: string;
	/**
	 * May be empty. A profile is written in a single merge, but one can already
	 * exist in a partial state, as `upsertUserDoc` shows, so this never assumes
	 * a name is there to print.
	 */
	displayName: string;
	/**
	 * The season whose squad this newcomer most likely belongs on, or `null`
	 * when there is none. Seasons can genuinely overlap. A Tuesday season and a
	 * Sunday offshoot can both be `active` at once, each with their own admins,
	 * so there is no single "the" season to resolve by construction. The caller
	 * (`getMostRecentActiveSeasonId`) stands in "most recently created" for
	 * "the one an admin reached for last".
	 */
	seasonId: string | null;
}

/**
 * Somebody has signed into the app for the first time.
 *
 * Sent to app admins only, and links straight to that season's manage-squad
 * screen so adding the newcomer is the very next tap rather than a hunt
 * through `/admin`. Falls back to `/admin` when there is no active season to
 * add them to.
 */
export const buildNewPlayerPush = ({ uid, displayName, seasonId }: NewPlayerContext): PushPayload => ({
	title: 'New player',
	body: `${displayName.trim() || 'Somebody'} just signed into Frescati for the first time.`,
	url: seasonId ? `/s/${seasonId}/admin/members` : '/admin',
	// Per person rather than per event: two people joining the same evening are
	// two separate things to know about, so these must not replace each other.
	tag: `new-player-${uid}`,
	respondable: false,
});

export interface DuesReminderContext {
	seasonId: string;
	/** What distinguishes two seasons somebody owes money to. */
	seasonName: string;
	/** SEK, read off the mark rather than sent by the screen that asked for this. */
	outstanding: number;
	/** How many charges it is spread across. */
	charges: number;
	/**
	 * Whether this debt is also stopping them signing up for a game.
	 *
	 * A season admin owes their share like everybody else and is never locked
	 * out by it, because the season usually collects to their own number and
	 * Swish refuses a payment to yourself. So the sentence about not being able
	 * to sign up would be a lie told to exactly the person who has to run the
	 * season. Same split `debtStanding` makes between `blocked` and `owing`.
	 */
	blocked: boolean;
}

/**
 * What you owe a season, sent because an admin sat down with the books and
 * chased you.
 *
 * The amount goes in the title for the reason `availability` puts a name there.
 * It is the whole notification, and the body is the half a lock screen
 * truncates. It is also the only kind whose numbers are not the sender's to
 * choose. They come off `debtors/{uid}`, which is function-owned, so nobody can
 * push a figure at a player that the books do not already say.
 *
 * Never `respondable`. The worker's "I'm in" shortcut writes the exact response
 * this debt is refusing, so offering it would put a button on the notification
 * that the security rule is there to reject.
 */
export const buildDuesPush = ({
	seasonId,
	seasonName,
	outstanding,
	charges,
	blocked,
}: DuesReminderContext): PushPayload => ({
	title: `You owe ${formatSek(outstanding)}`,
	body: blocked
		? `${seasonName}, across ${counted(charges, 'charge')}. You cannot say you are in for another game until it is settled.`
		: `${seasonName}, across ${counted(charges, 'charge')}. Mark it paid in the books once you have settled it.`,
	// The books, which is where the Swish code is drawn and where the charges
	// are itemised. Nothing else on that screen needs finding.
	url: `/s/${seasonId}/finances`,
	// One tag per season, so being chased twice replaces itself on the lock
	// screen rather than stacking. Two admins doing the books on the same
	// evening is the case this exists for, and the second notification says the
	// same thing as the first.
	tag: `dues-${seasonId}`,
	respondable: false,
});

/**
 * The same notification, as an email.
 *
 * Built **from the push payload** rather than from the kind and context, which
 * is the whole point: there is one set of copy, and an email can't drift from
 * the notification it stands in for. It reads as second-class on purpose: a
 * subject, the line that would have been on the lock screen, and a way in.
 */
export interface EmailPayload {
	subject: string;
	html: string;
	/** Plain-text alternative. Not optional, because a mail with only HTML scores as spam. */
	text: string;
}

/**
 * Everything in an email is interpolated into markup, and one of the bodies
 * carries an admin's free-typed cancellation reason.
 */
const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

/**
 * Hex rather than the `@theme` tokens every component uses.
 *
 * The one place in the app allowed to. Somebody else's mail client renders
 * this, and there it has no stylesheet, no custom properties and often no
 * `<style>` block at all. Inline attributes on tables is the whole toolkit.
 * Kept in step with `globals.css` by hand.
 */
const CANVAS = '#07080a';
const SURFACE = '#0f1115';
const LINE = '#262b34';
const INK = '#f3f5f8';
const MUTED = '#98a1b1';
const FAINT = '#626b7a';
const BRAND = '#3ddc84';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Absolute, because a mail client has no origin to resolve `/s/…` against.
 *
 * Trailing slashes on the configured base would otherwise produce `//s/…`,
 * which some clients rewrite as a protocol-relative URL and send nowhere.
 */
const absolute = (appUrl: string, path: string): string => `${appUrl.replace(/\/+$/, '')}${path}`;

export const buildEmail = (payload: PushPayload, { appUrl }: { appUrl: string }): EmailPayload => {
	const link = absolute(appUrl, payload.url);
	const settings = absolute(appUrl, '/me');
	// `respondable` already marks the ones with a question in them, which is
	// exactly when "open the app" has something for you to do.
	const action = payload.respondable ? "Say if you're in" : 'Open Frescati';

	const text = [
		payload.title,
		'',
		payload.body,
		'',
		`${action}: ${link}`,
		'',
		"You're getting this by email because Frescati couldn't reach this account with a push notification.",
		`Turn notifications on, or switch these emails off, at ${settings}`,
	].join('\n');

	const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};margin:0;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:${SURFACE};border:1px solid ${LINE};border-radius:16px;">
        <tr>
          <td style="padding:28px 24px;font-family:${FONT};">
            <p style="margin:0 0 20px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">Frescati</p>
            <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${escapeHtml(payload.title)}</h1>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:${MUTED};">${escapeHtml(payload.body)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background-color:${BRAND};">
                  <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:${CANVAS};text-decoration:none;">${action}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px;font-family:${FONT};">
            <p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${FAINT};">
              You're getting this by email because Frescati couldn't reach this account with a push notification.
              <a href="${escapeHtml(settings)}" style="color:${MUTED};">Turn notifications on, or switch these emails off.</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

	return { subject: payload.title, html, text };
};
