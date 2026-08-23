/**
 * Where the browser posts Content-Security-Policy violations.
 *
 * The app has no API layer and doesn't want one, everything else talks to
 * Firestore directly, with security rules as the authorization layer. This is
 * a deliberate exception, and a narrow one: it accepts a report, writes it to
 * the platform log and answers 204. It reads nothing, writes nothing and
 * authorizes nothing.
 *
 * It exists because the policy in `next.config.js` ships report-only, with a
 * comment promising to watch real traffic and then tighten. Without somewhere
 * to send reports that promise could not be kept: violations landed only in the
 * console of whoever happened to have devtools open on the live site, so the
 * decision to enforce could only ever have been made blind.
 *
 * Unauthenticated by necessity. A browser posts these without credentials, and
 * there is no session to check, which is also why nothing here is trusted:
 * the body is logged, never parsed into anything that decides something.
 */

/**
 * Long enough for any genuine report, short enough that a public endpoint
 * can't be used to write a novel into the log line by line.
 */
const MAX_REPORT_CHARS = 4_000;

export const POST = async (request: Request): Promise<Response> => {
	// Always 204, whatever happened. A violation report is a diagnostic; a
	// browser retrying one because this answered 500 would only add noise to
	// the thing being diagnosed.
	try {
		// Logged as text rather than parsed: `report-uri` sends a
		// `{ "csp-report": … }` body and `report-to` sends a Reporting API
		// array, and nothing downstream cares enough to tell them apart.
		const body = (await request.text()).slice(0, MAX_REPORT_CHARS);

		if (body) console.warn('CSP violation', body);
	} catch (error) {
		console.error('Could not read a CSP report', error);
	}

	return new Response(null, { status: 204 });
};
