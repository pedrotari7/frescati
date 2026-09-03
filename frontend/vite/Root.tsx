import { Outlet } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import { Analytics } from '@vercel/analytics/react';
import { colors, fonts } from '../app/tokens.stylex';
import { AuthProvider } from '../lib/auth';
import ErrorBoundary from '../components/ErrorBoundary';
import ToastProvider from '../components/Toast';
import ConfirmProvider from '../components/ConfirmDialog';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';
import PwaInstallPrompt from '../components/PwaInstallPrompt';
import DevUserSwitcher from '../components/DevUserSwitcher';

/**
 * What is left of `app/layout.tsx` once the document is somebody else's job.
 *
 * The provider tree below is that file's `<body>`, node for node, with
 * `{children}` become an `<Outlet />`. The `<head>` is `index.html` now, and the
 * two elements the app is drawn on are the awkward part: a root layout renders
 * `<html>` and `<body>` and can put a style object on them, and an SPA is
 * handed both by a document that no build step rendered.
 *
 * So `applyDocumentStyles` below puts the classes on by hand, from `main.tsx`,
 * before the first render. It is the same style objects reaching the same two
 * elements, an assignment later.
 */

/*
 * Copied out of `app/layout.tsx` rather than imported, because that file
 * exports a layout and not its styles, and exporting them to share with a
 * second build would be a change to a file the Next build compiles.
 *
 * Copied, therefore able to drift. What stops it mattering is that both are
 * hashes of the same declarations: two copies of these objects compile to one
 * set of class names and one set of rules, so a change to one and not the other
 * shows up as an element wearing a class the other build's stylesheet does not
 * define, which is exactly what `pnpm check:stylex` fails on.
 */
const styles = stylex.create({
	html: {
		backgroundColor: colors.canvas,
		colorScheme: 'dark',
		overscrollBehaviorY: 'none',
		WebkitTapHighlightColor: 'transparent',
	},
	body: {
		backgroundColor: colors.canvas,
		color: colors.ink,
		fontFamily: fonts.sans,
		minHeight: '100dvh',
	},
});

/** Puts one compiled style object onto an element that React does not render. */
const wear = (
	element: HTMLElement,
	props: { className?: string; style?: Readonly<Record<string, string | number>> }
) => {
	if (props.className) element.className = props.className;

	// StyleX hands back inline custom properties for anything it could not
	// resolve to a static class. Empty here today, and applied anyway so that
	// stops being true silently.
	for (const [name, value] of Object.entries(props.style ?? {})) element.style.setProperty(name, String(value));
};

/**
 * Dresses `<html>` and `<body>`.
 *
 * Called from `main.tsx` before the first render rather than from an effect, so
 * the canvas is right on the first paint the app controls. `index.html` carries
 * a hardcoded copy of the background for the paint before this one.
 */
export const applyDocumentStyles = () => {
	wear(document.documentElement, stylex.props(styles.html));
	wear(document.body, stylex.props(styles.body));
};

const Root = () => (
	<>
		<ErrorBoundary>
			<AuthProvider>
				<ToastProvider>
					<ConfirmProvider>
						<Outlet />
						<PwaInstallPrompt />
						{/* Renders nothing unless the app is on the emulators. */}
						<DevUserSwitcher />
					</ConfirmProvider>
				</ToastProvider>
			</AuthProvider>
		</ErrorBoundary>
		<ServiceWorkerRegistrar />
		<Analytics />
	</>
);

export default Root;
