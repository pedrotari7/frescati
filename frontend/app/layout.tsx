import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from '../lib/auth';
import ErrorBoundary from '../components/ErrorBoundary';
import ToastProvider from '../components/Toast';
import ConfirmProvider from '../components/ConfirmDialog';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';
import PwaInstallPrompt from '../components/PwaInstallPrompt';
import DevUserSwitcher from '../components/DevUserSwitcher';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
	title: 'Frescati',
	description: 'Who’s playing on Saturday?',
	manifest: '/manifest.json',
	applicationName: 'Frescati',
	appleWebApp: {
		capable: true,
		title: 'Frescati',
		statusBarStyle: 'black-translucent',
	},
	icons: {
		icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
		apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
	},
	formatDetection: { telephone: false },
};

export const viewport: Viewport = {
	themeColor: '#07080a',
	width: 'device-width',
	initialScale: 1,
	// Lets the app paint under the notch and home indicator; `.pb-safe` and
	// friends in globals.css put the padding back where it matters.
	viewportFit: 'cover',
};

/**
 * The origins a cold start cannot draw anything without: the token endpoint,
 * the App Check exchange, the reCAPTCHA script that feeds it, and Firestore
 * itself. Not one of them is discoverable from the HTML — every one is reached
 * for by a Firebase SDK after hydration — so the DNS lookup, TCP handshake and
 * TLS negotiation for all four begin only once the app is already waiting on
 * them, on the launch where the radio is coldest.
 *
 * `preconnect` rather than `dns-prefetch`: the lookup is the cheap part.
 *
 * Split by request mode, because a preconnected socket is only reused by
 * requests whose credentials mode matches the hint. The three API hosts are
 * CORS `fetch`/XHR, which is what `crossOrigin` says here; `www.google.com`
 * serves reCAPTCHA as a plain `<script src>` with no `crossorigin` attribute,
 * so hinting it anonymously would open a connection nothing then used and leave
 * the one hop with no timeout behind it (see `getDb`) paying full price anyway.
 */
const CORS_PRECONNECT = [
	'https://securetoken.googleapis.com',
	'https://firebaseappcheck.googleapis.com',
	'https://firestore.googleapis.com',
];

const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang='en'>
		<head>
			{CORS_PRECONNECT.map(origin => (
				<link key={origin} rel='preconnect' href={origin} crossOrigin='anonymous' />
			))}
			<link rel='preconnect' href='https://www.google.com' />
		</head>
		<body suppressHydrationWarning>
			<ErrorBoundary>
				<AuthProvider>
					<ToastProvider>
						<ConfirmProvider>
							{children}
							<PwaInstallPrompt />
							{/* Renders nothing unless the app is on the emulators. */}
							<DevUserSwitcher />
						</ConfirmProvider>
					</ToastProvider>
				</AuthProvider>
			</ErrorBoundary>
			<ServiceWorkerRegistrar />
			<Analytics />
		</body>
	</html>
);

export default RootLayout;
