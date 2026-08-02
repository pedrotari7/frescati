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
	description: 'Who’s playing on Tuesday?',
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

const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang='en'>
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
