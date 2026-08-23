/**
 * Prints a user's Firebase Auth record and custom claims. It is the quickest way to
 * confirm an admin grant landed, since claims aren't visible in the console UI.
 *
 * Usage: pnpm --filter backend whoami you@example.com
 */

import { getAuth } from 'firebase-admin/auth';
import { UsageError, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

const main = async ({ args }: ScriptContext) => {
	const [email] = args;

	if (!email) throw new UsageError('Usage: pnpm --filter backend whoami <email>');

	const user = await getAuth().getUserByEmail(email);

	console.log({
		uid: user.uid,
		email: user.email,
		displayName: user.displayName,
		claims: user.customClaims ?? {},
		isAppAdmin: user.customClaims?.admin === true,
		created: user.metadata.creationTime,
		lastSignIn: user.metadata.lastSignInTime,
	});
};

runScript(main);
