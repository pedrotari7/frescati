/**
 * Paying by Swish without retyping anything.
 *
 * One string, handed to the platform twice: drawn as a QR code and put behind a
 * button. It is a URL, which is what lets one string do both jobs. A phone
 * camera can act on a URL and open the Swish app with the payment already in it,
 * and a camera is what somebody at the side of a pitch points at a code.
 *
 * Nothing here talks to Swish. No account, no merchant agreement, no certificate
 * and no server call, which matters twice over: Swish's own prefill endpoint is
 * not in the CSP `connect-src`, and a payment screen that waits on a third-party
 * request is a payment screen that fails at the pitch with eleven people
 * watching.
 */

/** Everything a payment needs. `amount` is whole SEK. */
export interface SwishPayment {
	/** The collecting Swish number, in either local `07...` or `+46...` form. */
	payee: string;
	amount: number;
	/** The reference the payee reconciles against. Empty is allowed. */
	message: string;
}

/**
 * `0701234567` becomes `+46701234567`.
 *
 * The form a person reads, so this is what `/debug` prints next to the local one
 * and nothing machine-facing uses it. An admin types their number however they
 * think of it and every consumer here still gets the shape it needs. A number
 * already carrying a country code is left alone.
 */
export const toInternational = (payee: string): string => {
	const digits = payee.replace(/[^\d+]/g, '');

	if (digits.startsWith('+')) return digits;
	if (digits.startsWith('00')) return `+${digits.slice(2)}`;
	if (digits.startsWith('0')) return `+46${digits.slice(1)}`;

	return `+46${digits}`;
};

/** `+46701234567` becomes `0701234567`, the form the screen shows and copies. */
export const toLocal = (payee: string): string => {
	const international = toInternational(payee);

	return international.startsWith('+46') ? `0${international.slice(3)}` : international.slice(1);
};

/**
 * `0701234567` becomes `46701234567`: a Swish alias, which is digits and only
 * digits.
 *
 * The plus is the whole reason this exists. Swish writes an alias as a country
 * code with no `+` and no leading zero, the same shape its own API calls
 * `payeeAlias`, and a link carrying `+46701234567` is the malformed link the app
 * refuses with "the link used to open the app has an incorrect format".
 */
export const toAlias = (payee: string): string => toInternational(payee).slice(1);

/** Swish's own host and the path its links take, with no scheme in front. */
const SWISH_LINK = 'app.swish.nu/1/p/sw/';

/** The Android package that answers for that host. */
const SWISH_PACKAGE = 'se.bankgirot.swish';

/**
 * The query both forms of the link carry, escaped and in Swish's own order.
 *
 * `edit` is the single parameter deliberately left out: it lists the fields the
 * payer may still change, and omitting it locks all of them. The reference is
 * how an admin works out whose payment landed, and an editable one is a payment
 * nobody can match to a name.
 */
const swishQuery = ({ payee, amount, message }: SwishPayment): string => {
	const params = new URLSearchParams({ sw: toAlias(payee), amt: String(Math.round(amount)), cur: 'SEK' });

	// Omitted rather than sent blank, which is what the generators do too.
	if (message) params.set('msg', message);

	params.set('src', 'qr');

	// `URLSearchParams` spells a space `+`, and a payee reads this reference off a
	// bank statement by eye, where `Fall+2026` is not what anybody typed. Safe as
	// a blanket replace because a plus somebody really typed is already `%2B` by
	// the time it gets here.
	return params.toString().replace(/\+/g, '%20');
};

/**
 * The URL that opens the Swish app with the payment already filled in.
 *
 * `https://app.swish.nu/1/p/sw/?sw=...&amt=...&cur=SEK&msg=...&src=qr`. Swish
 * publishes no specification for it, so what stands behind it is evidence rather
 * than a document. The host is Swish's own and serves both an
 * `apple-app-site-association` and an `assetlinks.json` claiming path `*` for
 * `se.bankgirot.swish`, so a phone with Swish installed hands the whole link to
 * the app and a phone without it lands on a page offering the download. The
 * query string is used unchanged by people collecting real money with it: a
 * housing association's membership fee, a webshop's checkout, an invoicing app
 * that prints it as the QR code on a PDF. `src=qr` is Swish's own name for a
 * link that arrived by being scanned, which is the clearest sign that a QR code
 * is meant to carry this rather than something else.
 *
 * The parameters are built the way those generators build them, in their order,
 * because a difference from a link known to work should be one we chose.
 *
 * This is the form the QR code carries and the form every platform but Android
 * puts behind the button. `swishIntentUrl` says why Android is the exception.
 *
 * What this replaced was `swish://payment?data=<json>`, a 2018 reverse
 * engineering with no first party behind it that the app now rejects. The one
 * custom scheme Swish does document, `swish://paymentrequest?token=...`, needs a
 * Swish Handel agreement and a token from a server, so it is not that either.
 */
export const swishAppUrl = (payment: SwishPayment): string => `https://${SWISH_LINK}?${swishQuery(payment)}`;

/**
 * The same payment, addressed to the Swish package by name.
 *
 * Android is the platform where the https link is not enough. Nothing at
 * `app.swish.nu` reads a payment: every path on that host serves the same
 * "Ladda ner Swish" page, so the link is only ever a way of asking the system to
 * fetch the app, and when that ask is refused a person who already has Swish is
 * looking at a page telling them to install it.
 *
 * iOS answers that ask itself, before a browser ever sees the link. Android
 * leaves it to the browser, and the browser hands it over on two conditions:
 * the app verified its claim on the host when it was installed, and the person
 * still has "Open supported links" switched on for it. Either can be off.
 * Neither says so. The tap just lands on the download page. On top of that this
 * app runs as a WebAPK, so the tap leaves one app for another rather than
 * following a link inside a tab, and that is the handoff Android is most
 * reluctant about.
 *
 * `intent://` skips the lot. `package=` names Swish outright, and an explicit
 * intent answers to neither the verification nor the setting. It is the same
 * route the phone's own camera takes with a scanned code, which is why the QR
 * has always worked on the phones this button did not.
 *
 * `S.browser_fallback_url` is what makes it safe to prefer. A phone with no
 * Swish, or a browser that has never heard of the scheme, follows that to the
 * plain https link and gets the download page it would have got anyway. The
 * intent form can be no worse than what it replaces.
 *
 * Chromium and Firefox both read this, and on Android that is every browser
 * worth counting. `scheme=https` is what the intent resolves back to, so Swish
 * is handed the same URL the QR code carries.
 */
export const swishIntentUrl = (payment: SwishPayment): string => {
	const fallback = encodeURIComponent(swishAppUrl(payment));

	return `intent://${SWISH_LINK}?${swishQuery(payment)}#Intent;scheme=https;package=${SWISH_PACKAGE};S.browser_fallback_url=${fallback};end`;
};
