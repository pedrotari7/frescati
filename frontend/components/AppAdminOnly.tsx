import PageShell from './PageShell';
import EmptyState from './EmptyState';

/**
 * What somebody without the global role sees instead of an admin screen.
 *
 * Six screens each rendered this by hand, which made a permission boundary
 * something you found by grepping for a string. It is a *courtesy*, not the
 * enforcement: every one of these screens reads data the security rules already
 * guard and calls functions that check the claim again server-side, so
 * bypassing this in the console buys an empty page. What it is actually for is
 * telling somebody who followed a link why there is nothing here.
 *
 * Rendered from the page's early return rather than wrapped around its body, so
 * each page keeps the guard-then-loading-then-content shape it already had,
 * and so the hooks above it still run in the same order for everybody.
 *
 * `message` says what the screen would have done. "App admins only" alone
 * leaves somebody wondering whether they are missing something important; a
 * sentence about what it manages usually settles it.
 */
const AppAdminOnly = ({ title, message, backHref = '/me' }: { title: string; message: string; backHref?: string }) => (
	<PageShell title={title} backHref={backHref}>
		<EmptyState title='App admins only' message={message} />
	</PageShell>
);

export default AppAdminOnly;
