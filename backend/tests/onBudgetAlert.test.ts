import { onBudgetAlert } from '../src/onBudgetAlert';

/**
 * The one function here whose bug takes the app off the internet.
 *
 * Everything else in this backend fails by not sending a push or by leaving a
 * counter stale. This one fails by disabling billing on a Tuesday evening, so
 * what these tests are mostly about is the cases where it must do *nothing* —
 * the money not being spent yet, the alert being about a projection, the whole
 * thing running on somebody's laptop. The one test that lets it fire is the
 * short one at the bottom.
 *
 * It touches no Firestore, so there is no `clearFirestore` here: the entire
 * surface is one Pub/Sub payload in and at most two HTTP calls out.
 */

const anAlert = (overrides: Record<string, unknown> = {}) =>
	({
		data: {
			message: {
				json: {
					budgetDisplayName: 'footballfrescati',
					costAmount: 12.5,
					budgetAmount: 100,
					currencyCode: 'SEK',
					...overrides,
				},
			},
		},
		// The handler reads nothing else off the envelope.
	}) as unknown as Parameters<typeof onBudgetAlert.run>[0];

/**
 * Lifts the local guard for the tests that need the real path, and puts it back
 * afterwards.
 *
 * `SENTRY_DSN` is blanked alongside the emulator variables on purpose. The
 * emulator check is what keeps the test suite's deliberately-provoked failures
 * out of the live Sentry project, so a test that removes it would start
 * reporting for real on any machine with a DSN exported into the shell — which
 * is precisely the leak `lib/sentry.ts` chose `FIRESTORE_EMULATOR_HOST` to
 * close.
 */
const asDeployed = (): (() => void) => {
	const saved = {
		firestore: process.env.FIRESTORE_EMULATOR_HOST,
		functions: process.env.FUNCTIONS_EMULATOR,
		dsn: process.env.SENTRY_DSN,
	};

	delete process.env.FIRESTORE_EMULATOR_HOST;
	delete process.env.FUNCTIONS_EMULATOR;
	process.env.SENTRY_DSN = '';

	return () => {
		if (saved.firestore === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
		else process.env.FIRESTORE_EMULATOR_HOST = saved.firestore;

		if (saved.functions === undefined) delete process.env.FUNCTIONS_EMULATOR;
		else process.env.FUNCTIONS_EMULATOR = saved.functions;

		if (saved.dsn === undefined) delete process.env.SENTRY_DSN;
		else process.env.SENTRY_DSN = saved.dsn;
	};
};

/** Enough of a `Response` for the three calls the handler makes. */
const httpResponse = (status: number, body: unknown) => ({
	ok: status >= 200 && status < 300,
	status,
	json: async () => body,
	// Read by the two error messages, which quote the body back.
	text: async () => JSON.stringify(body),
});

interface BillingStub {
	billingEnabled?: boolean;
	/** Overrides for the metadata server's token response. */
	token?: { status?: number; body?: Record<string, unknown> };
	/** Overrides for the billingInfo read. */
	read?: { status?: number };
	/** Overrides for the billingInfo write. */
	write?: { status?: number };
}

/** Routes the three calls the handler can make: token, read, write. */
const mockBilling = ({ billingEnabled = true, token, read, write }: BillingStub = {}) => {
	const fetchMock = jest.fn(async (url: string | URL, init?: { method?: string }) => {
		const href = String(url);

		if (href.includes('metadata.google.internal')) {
			return httpResponse(token?.status ?? 200, token?.body ?? { access_token: 'test-token' });
		}

		if (href.includes('cloudbilling.googleapis.com')) {
			if (init?.method === 'PUT') return httpResponse(write?.status ?? 200, { billingEnabled: false });
			return httpResponse(read?.status ?? 200, { billingEnabled });
		}

		throw new Error(`Unexpected fetch in test: ${href}`);
	});

	global.fetch = fetchMock as unknown as typeof fetch;

	return fetchMock;
};

const putCalls = (fetchMock: jest.Mock) =>
	fetchMock.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PUT');

describe('onBudgetAlert', () => {
	const realFetch = global.fetch;

	afterEach(() => {
		global.fetch = realFetch;
	});

	it('does nothing while spend is under the budget', async () => {
		const fetchMock = mockBilling({ billingEnabled: true });

		await onBudgetAlert.run(anAlert({ costAmount: 49 }));

		// Not merely "no PUT" — it should not even ask for a token. A 50%
		// threshold crossing is a notification, and notifications are free.
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does nothing one öre under the budget', async () => {
		const fetchMock = mockBilling({ billingEnabled: true });

		await onBudgetAlert.run(anAlert({ costAmount: 99.99 }));

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('ignores a forecast that projects over the budget while actual spend is low', async () => {
		const fetchMock = mockBilling({ billingEnabled: true });

		// This is the shape of the message that arrives on day two of a quiet
		// month: the run rate points over the line, almost nothing is spent. The
		// forecast fields are not modelled by the handler at all, and this test
		// is what keeps somebody from helpfully adding them back.
		await onBudgetAlert.run(
			anAlert({ costAmount: 3.2, forecastThresholdExceeded: 1.0, alertThresholdExceeded: undefined })
		);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses to guess when the payload carries no usable amounts', async () => {
		mockBilling({ billingEnabled: true });

		// Silence would be the dangerous outcome here: a payload this code can no
		// longer read would look exactly like a month that never went over.
		await expect(onBudgetAlert.run(anAlert({ costAmount: undefined }))).rejects.toThrow(/no usable amounts/);
	});

	it('does not touch billing from a local run, even at the cap', async () => {
		// `FIRESTORE_EMULATOR_HOST` is set for this whole suite, which is exactly
		// the condition this asserts: `pnpm test:backend` imports these handlers
		// directly, so without the guard the assertion below would be a request
		// to disable billing on the real project.
		const fetchMock = mockBilling({ billingEnabled: true });

		await onBudgetAlert.run(anAlert({ costAmount: 250 }));

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('leaves billing alone when it is already disabled', async () => {
		const restore = asDeployed();
		const fetchMock = mockBilling({ billingEnabled: false });

		try {
			await onBudgetAlert.run(anAlert({ costAmount: 250 }));
		} finally {
			restore();
		}

		// The budget keeps republishing for the rest of the month once it has
		// crossed; only the read should repeat.
		expect(putCalls(fetchMock)).toHaveLength(0);
	});

	it('disables billing once actual spend reaches the budget', async () => {
		const restore = asDeployed();
		const fetchMock = mockBilling({ billingEnabled: true });

		try {
			await onBudgetAlert.run(anAlert({ costAmount: 100 }));
		} finally {
			restore();
		}

		const puts = putCalls(fetchMock);
		expect(puts).toHaveLength(1);

		const [url, init] = puts[0] as [string, { body: string }];
		expect(String(url)).toContain('/projects/demo-frescati/billingInfo');
		// An empty account name is how the API spells "detached".
		expect(JSON.parse(init.body)).toEqual({ billingAccountName: '' });
	});

	it('treats a message carrying no payload at all as unreadable', async () => {
		const fetchMock = mockBilling();

		// `json` is absent rather than malformed — a Pub/Sub message that isn't
		// a budget alert. It must not fall through the `?? {}` and read as a
		// month that stayed under, which is the same silence the malformed case
		// above refuses.
		const empty = { data: { message: {} } } as unknown as Parameters<typeof onBudgetAlert.run>[0];

		await expect(onBudgetAlert.run(empty)).rejects.toThrow(/no usable amounts/);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

/**
 * What happens when Google does not answer.
 *
 * This is the half that decides whether the budget cap works at all. Every one
 * of these throws, and throwing is the whole point: an unhandled rejection here
 * is reported by `instrument` and left unacknowledged, so Pub/Sub redelivers the
 * alert — and the budget republishes it every twenty minutes regardless. Swallow
 * any of them and the cap becomes decorative, in the one direction nobody would
 * ever notice, because a cap that never fires looks exactly like a month that
 * stayed under budget.
 *
 * The other thing each asserts is that nothing reaches the PUT on a path that
 * went wrong earlier. Disabling billing is not a step to attempt hopefully with
 * a token the metadata server refused to issue.
 */
describe('onBudgetAlert when the billing API does not answer', () => {
	const realFetch = global.fetch;

	afterEach(() => {
		global.fetch = realFetch;
	});

	/** At the cap and deployed, so the handler goes all the way down the path. */
	const runAtCap = async (stub: BillingStub) => {
		const restore = asDeployed();
		const fetchMock = mockBilling(stub);

		try {
			return { fetchMock, error: await onBudgetAlert.run(anAlert({ costAmount: 250 })).catch(thrown => thrown) };
		} finally {
			restore();
		}
	};

	it('gives up when the metadata server refuses a token', async () => {
		const { fetchMock, error } = await runAtCap({ token: { status: 403 } });

		expect(error).toMatchObject({ message: expect.stringContaining('Metadata server refused a token: 403') });
		expect(putCalls(fetchMock)).toHaveLength(0);
	});

	it('gives up when the metadata server answers without a token in it', async () => {
		// A 200 with the wrong shape, which `response.ok` alone would wave
		// through into an `Authorization: Bearer undefined`.
		const { fetchMock, error } = await runAtCap({ token: { body: { expires_in: 3599 } } });

		expect(error).toMatchObject({ message: expect.stringContaining('no token in it') });
		expect(putCalls(fetchMock)).toHaveLength(0);
	});

	it('gives up when it cannot read whether billing is still on', async () => {
		// Not knowing must not read as "already disabled", which is the answer
		// that would quietly skip the write and log that all was well.
		const { fetchMock, error } = await runAtCap({ read: { status: 500 } });

		expect(error).toMatchObject({ message: expect.stringContaining('Could not read billing info: 500') });
		expect(putCalls(fetchMock)).toHaveLength(0);
	});

	it('reports loudly when the write to disable billing is refused', async () => {
		// The failure that matters most: everything upstream worked, the project
		// is over budget and still billable, and the one call that would stop the
		// spending did not land. Silence here is unbounded spend.
		const { fetchMock, error } = await runAtCap({ write: { status: 403 } });

		expect(error).toMatchObject({ message: expect.stringContaining('Could not disable billing: 403') });
		expect(putCalls(fetchMock)).toHaveLength(1);
	});
});
