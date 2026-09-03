/**
 * Where the browser posts Content-Security-Policy violations, under the Vite
 * build.
 *
 * The same handler as `app/api/csp-report/route.ts`, which is the one the
 * shipped app uses, rewritten against Vercel's own function signature because
 * there is no framework here to give it a route. Everything that file says
 * about why this exists still holds: it accepts a report, writes it to the
 * platform log and answers 204, and it reads nothing, writes nothing and
 * authorizes nothing.
 *
 * Two copies of a twenty-line handler is a cost of the port, and a small one.
 * The larger cost is next door in `vercel.json`, where the policy that produces
 * these reports stops being computed.
 */

/** Long enough for a genuine report, short enough that a public endpoint can't write a novel into the log. */
const MAX_REPORT_CHARS = 4_000;

export const POST = async (request: Request): Promise<Response> => {
	try {
		const body = (await request.text()).slice(0, MAX_REPORT_CHARS);

		if (body) console.warn('CSP violation', body);
	} catch (error) {
		console.error('Could not read a CSP report', error);
	}

	// Always 204, whatever happened. A browser retrying a diagnostic because
	// this answered 500 would only add noise to the thing being diagnosed.
	return new Response(null, { status: 204 });
};

export default POST;
