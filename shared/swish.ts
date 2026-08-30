/**
 * Paying by Swish without retyping anything.
 *
 * Two independent mechanisms, and neither one talks to Swish. Both are strings
 * built here and handed to the platform: a payload the Swish app reads out of a
 * QR code, and a URL that opens the app with the payment already filled in.
 * There is no account, no merchant agreement, no certificate and no server call,
 * which matters twice over. Swish's own prefill endpoint is not in the CSP
 * `connect-src`, and a payment screen that waits on a third-party request is a
 * payment screen that fails at the pitch with eleven people watching.
 *
 * The two are not equals. The QR payload is specified (*Guide Swish QR code
 * specification v1.7.2*, section 6.1) and the app URL's query string is not, so
 * the QR is the path that is always drawn and the link is an extra on top of it.
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

/** `+46701234567` becomes `0701234567`, for the QR payload's local form. */
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

/**
 * The reference, encoded so that Swish reads back the characters we sent.
 *
 * `encodeURIComponent` and then one more pass for the plus, which it leaves
 * alone. Swish's own QR generator spells a space `+`, so whatever is reading
 * these decodes a form rather than a URL, and under those rules a `+` we did not
 * escape arrives as a space. `%20` and `%2B` mean the right thing to a form
 * decoder and to a URL decoder both, which is why the space stays `%20` rather
 * than matching Swish byte for byte.
 */
const encodeReference = (message: string): string => encodeURIComponent(message).replace(/\+/g, '%2B');

/**
 * The string a Swish QR code carries: `C<payee>;<amount>;<message>;<lock_mask>`.
 *
 * The `C` prefix is required and, despite reading like "company", works with an
 * ordinary mobile number, which is the only reason any of this is usable by a
 * football group rather than a registered merchant.
 *
 * The mask is which fields the payer may still edit: payee bit 0, amount bit 1,
 * message bit 2, a set bit meaning editable. It is `0` here, everything locked,
 * because the message is how an admin works out whose payment just landed and an
 * editable one is a payment nobody can match to a name.
 */
export const swishQrPayload = ({ payee, amount, message }: SwishPayment): string =>
	`C${toLocal(payee)};${Math.round(amount)};${encodeReference(message)};0`;

/**
 * The URL that opens the Swish app with the payment prefilled.
 *
 * An `https://app.swish.nu/...` link rather than a `swish://` one, and the
 * difference is which half is guesswork. The host is Swish's own: it serves both
 * `apple-app-site-association` and `assetlinks.json` claiming path `*` for
 * `se.bankgirot.swish`, so a phone with Swish installed hands the whole link to
 * the app, and a phone without it lands on a Swish page offering the download.
 * The query string is the part nobody publishes, read off the links Swish's own
 * QR generator emits. So it can still break without notice, which is why nothing
 * depends on it: `swishAppUrl` is only ever offered next to a QR code that works
 * on its own.
 *
 * What it replaced was `swish://payment?data=<json>`, which the app rejects as a
 * malformed link. That scheme is a 2018 reverse-engineering with no first party
 * behind it. The one custom scheme Swish does document,
 * `swish://paymentrequest?token=...&callbackurl=...`, needs a Swish Handel
 * agreement and a token from a server, so it is not this either.
 *
 * Built by hand rather than through `URLSearchParams`, which spells a space `+`.
 * A payee reconciles against this reference by eye and `Fall+2026` is not what
 * anybody typed.
 */
export const swishAppUrl = ({ payee, amount, message }: SwishPayment): string => {
	const params = [`sw=${toAlias(payee)}`, `amt=${Math.round(amount)}`, 'cur=SEK'];

	// Omitted rather than sent blank, the same way the QR payload omits it.
	if (message) params.push(`msg=${encodeReference(message)}`);

	return `https://app.swish.nu/1/p/sw/?${params.join('&')}&src=qr`;
};
