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
 * because a difference from a link known to work should be one we chose. `edit`
 * is the single parameter deliberately left out: it lists the fields the payer
 * may still change, and omitting it locks all of them. The reference is how an
 * admin works out whose payment landed, and an editable one is a payment nobody
 * can match to a name.
 *
 * What this replaced was `swish://payment?data=<json>`, a 2018 reverse
 * engineering with no first party behind it that the app now rejects. The one
 * custom scheme Swish does document, `swish://paymentrequest?token=...`, needs a
 * Swish Handel agreement and a token from a server, so it is not that either.
 */
export const swishAppUrl = ({ payee, amount, message }: SwishPayment): string => {
	const params = new URLSearchParams({ sw: toAlias(payee), amt: String(Math.round(amount)), cur: 'SEK' });

	// Omitted rather than sent blank, which is what the generators do too.
	if (message) params.set('msg', message);

	params.set('src', 'qr');

	// `URLSearchParams` spells a space `+`, and a payee reads this reference off a
	// bank statement by eye, where `Fall+2026` is not what anybody typed. Safe as
	// a blanket replace because a plus somebody really typed is already `%2B` by
	// the time it gets here.
	return `https://app.swish.nu/1/p/sw/?${params.toString().replace(/\+/g, '%20')}`;
};
