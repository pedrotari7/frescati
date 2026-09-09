import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import * as Sentry from '@sentry/react';
import '../app/globals.css';
import { sentryOptions } from '../lib/sentry';
import { applyDocumentStyles } from './Root';
import AppRoutes from './routes';

/**
 * Where the app starts under Vite.
 *
 * Next had three entry points doing this between them: `instrumentation-client.ts`
 * initialised Sentry before any of the app ran, `app/layout.tsx` rendered the
 * document and the providers, and the router was the file tree. This is all
 * three, in the order they have to happen.
 *
 * The order is the interesting part. Sentry goes first for the same reason Next
 * loaded that file first: a crash during the first render is the one an error
 * boundary cannot catch, because there is no mounted tree to fall back to.
 * `lib/sentry.ts` is unchanged and still inert without a DSN.
 */
Sentry.init(sentryOptions);

/*
 * Before the first render rather than in an effect, so `<html>` and `<body>`
 * are already wearing the palette when React paints. `index.html` covers the
 * frames before this line, with a hardcoded copy of the canvas colour.
 */
applyDocumentStyles();

const container = document.getElementById('root');

// A missing root is a broken `index.html`, which is a build problem rather than
// a runtime one. Throwing gets it into Sentry rather than rendering nothing.
if (!container) throw new Error('No #root in the document');

createRoot(container).render(
	<StrictMode>
		<BrowserRouter>
			<AppRoutes />
		</BrowserRouter>
	</StrictMode>
);
