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
 * specification v1.7.2*, section 6.1) and the app URL is reverse-engineered, so
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
 * The QR payload wants the local form and the app URL wants the international
 * one, which is the only reason this is a function rather than a stored choice:
 * an admin types their number however they think of it and both consumers still
 * get what they need. A number already carrying a country code is left alone.
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
	`C${toLocal(payee)};${Math.round(amount)};${encodeURIComponent(message)};0`;

/**
 * The URL that opens the Swish app with the payment prefilled.
 *
 * Undocumented, and worth being explicit about why we lean on it anyway: it is
 * the difference between a player paying while they are still standing on the
 * pitch and a player meaning to pay later. It can break without notice, so
 * nothing depends on it. `swishAppUrl` is only ever offered next to a QR code
 * that works on its own.
 *
 * The merchant flow (`swish://payment?token=...&callbackurl=...`) is documented
 * and needs a Swish Handel agreement, so it is not this.
 */
export const swishAppUrl = (payment: SwishPayment): string => {
	const data: Record<string, unknown> = {
		version: 1,
		payee: { value: toInternational(payment.payee) },
		amount: { value: Math.round(payment.amount) },
	};

	// Omitted rather than sent blank: an empty `message` key makes some app
	// versions open on an error instead of the payment sheet.
	if (payment.message) data.message = { value: payment.message };

	return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`;
};
