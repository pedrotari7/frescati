import type { CloudEvent } from 'firebase-functions/v2';
import type { MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from 'firebase-functions';
import { REGION } from './lib/firebase';
import { instrument } from './lib/sentry';

/**
 * Detaches the project from its billing account when the month's spend reaches
 * the budget, which takes the whole app down.
 *
 * That is the point, and it is worth being blunt about the trade. Every other
 * cost control here bounds a rate — `maxInstances` caps how much compute can
 * run at once, the Cloud Tasks debounce keeps the optimizer from rebuilding per
 * keystroke, App Check keeps a script out of a database whose every read is a
 * plain signed-in read. None of them bounds a *total*, because nothing in GCP
 * does: a budget is an email, and an email does not stop anything. This is the
 * only mechanism that ends spending rather than describing it, and the way it
 * ends spending is by turning Firestore off mid-game.
 *
 * So it is deliberately hard to trigger and deliberately impossible to trigger
 * by accident:
 *
 * - It fires on **money already spent**, never on a forecast. The budget
 *   publishes a forecast alert as soon as the month's run rate points over the
 *   line, which on a quiet month can be day two with pennies actually spent.
 *   Killing the app on a projection would mean killing it over arithmetic about
 *   a month that hasn't happened.
 * - It fires at **100%**, not at the 50% and 90% rules on the same budget.
 *   Those exist to reach a human while there is still something to decide.
 * - It can only ever detach **its own project**. The call is built from the
 *   runtime's own project id, so there is no input — from the message or
 *   anywhere else — that can point it at something else.
 * - It does nothing at all locally. `pnpm test:backend` imports these handlers
 *   straight into jest, so without that guard a test fixture shaped like a
 *   budget alert would take production offline.
 */

/**
 * The published-to-Pub/Sub shape of a budget alert. Only the four fields this
 * decision rests on are modelled; the message carries more.
 *
 * `costAmount` and `budgetAmount` are plain numbers in `currencyCode` — SEK
 * here, which is the budget's currency and not something to convert.
 *
 * The `forecastThresholdExceeded` field is *not* modelled, on purpose. It is
 * the one piece of the payload that must never reach this decision, and the
 * cheapest way to keep it out of the decision is to keep it out of the type.
 */
type BudgetAlert = {
	budgetDisplayName?: string;
	costAmount?: number;
	budgetAmount?: number;
	currencyCode?: string;
};

/** Set by the Cloud Run runtime. There is no other source for it, by design. */
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;

/**
 * Same predicate as the one in `email.ts` and the wider one in `sentry.ts`, and
 * the widest of the three on purpose: `FUNCTIONS_EMULATOR` alone is only set by
 * the functions emulator, and the backend test suite doesn't use it — it points
 * the handlers at the Firestore emulator and calls them directly. A guard that
 * missed that case would be a test that disables billing on the real project.
 */
const isLocal = (): boolean =>
	process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/**
 * An access token for the runtime's own service account, from the metadata
 * server rather than a library.
 *
 * `google-auth-library` would do this in one line, but it is only present as a
 * transitive dependency of `firebase-admin` — reaching for it from here would
 * be a phantom import that pnpm is right to break. One `fetch` against a
 * link-local address is not worth a declared dependency.
 */
const getAccessToken = async (): Promise<string> => {
	const response = await fetch(
		'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
		{ headers: { 'Metadata-Flavor': 'Google' } }
	);

	if (!response.ok) throw new Error(`Metadata server refused a token: ${response.status}`);

	const { access_token: accessToken } = (await response.json()) as { access_token?: string };
	if (!accessToken) throw new Error('Metadata server returned a token response with no token in it');

	return accessToken;
};

const billingInfoUrl = (): string => `https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`;

/**
 * Whether the project is still attached to a billing account.
 *
 * Checked before writing because the budget republishes its alert every twenty
 * minutes or so for the rest of the month once a threshold is crossed. The
 * write is idempotent anyway, but the read keeps the log honest — one line
 * saying billing was disabled, then quiet, rather than the same alarming line
 * every twenty minutes for three weeks.
 */
const isBillingEnabled = async (accessToken: string): Promise<boolean> => {
	const response = await fetch(billingInfoUrl(), { headers: { Authorization: `Bearer ${accessToken}` } });

	if (!response.ok) throw new Error(`Could not read billing info: ${response.status} ${await response.text()}`);

	const { billingEnabled } = (await response.json()) as { billingEnabled?: boolean };

	return billingEnabled === true;
};

/**
 * Detach the project from its billing account.
 *
 * An empty `billingAccountName` is how the Cloud Billing API spells "none" —
 * there is no delete verb for the association.
 */
const disableBilling = async (accessToken: string): Promise<void> => {
	const response = await fetch(billingInfoUrl(), {
		method: 'PUT',
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ billingAccountName: '' }),
	});

	if (!response.ok) throw new Error(`Could not disable billing: ${response.status} ${await response.text()}`);
};

export const onBudgetAlert = onMessagePublished(
	{ topic: 'billing-alerts', region: REGION },
	// Typed at the parameter rather than inferred: `onMessagePublished` is
	// overloaded four ways, so it offers no contextual type to an inline
	// handler the way the Firestore triggers in this backend do.
	instrument('onBudgetAlert', async (event: CloudEvent<MessagePublishedData<BudgetAlert>>) => {
		const alert = event.data.message.json ?? {};
		const { costAmount, budgetAmount, currencyCode, budgetDisplayName } = alert;

		// A malformed payload must not read as "under budget" and quietly do
		// nothing forever. Throwing puts it in Sentry, where a budget alert this
		// code can no longer parse is worth somebody's afternoon.
		if (typeof costAmount !== 'number' || typeof budgetAmount !== 'number') {
			throw new Error(`Budget alert had no usable amounts: ${JSON.stringify(alert)}`);
		}

		const spend = { budgetDisplayName, costAmount, budgetAmount, currencyCode };

		if (costAmount < budgetAmount) {
			logger.info('Budget alert below the cap, leaving billing alone', spend);
			return;
		}

		if (isLocal()) {
			logger.warn('Budget alert at or over the cap — would disable billing, but this is a local run', spend);
			return;
		}

		const accessToken = await getAccessToken();

		if (!(await isBillingEnabled(accessToken))) {
			logger.info('Budget alert at or over the cap, but billing is already disabled', spend);
			return;
		}

		// Deliberately `error`, not `warn`. This is the loudest thing this
		// backend can do to itself and the log should read like it.
		logger.error('Budget cap reached — disabling billing, which takes the app offline', spend);

		await disableBilling(accessToken);

		logger.error('Billing disabled. Re-enable it in the console; nothing here will do it automatically.', spend);
	})
);
