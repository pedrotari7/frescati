'use client';

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	pages: { display: 'flex', flexDirection: 'column', gap: 8 },
	/* White behind it for the same reason as an image preview: a scan is black
	   on transparent often enough. */
	page: { display: 'block', width: '100%', height: 'auto', borderRadius: 12, backgroundColor: colors.ink },
	status: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
});

/**
 * pdf.js, loaded the first time somebody previews a PDF and not before, since
 * it is several hundred kB nobody needs until then. The worker is bundled from
 * the package rather than fetched from a CDN, so `worker-src 'self'` covers it.
 */
const loadPdfJs = async () => {
	const pdfjs = await import('pdfjs-dist');

	if (!pdfjs.GlobalWorkerOptions.workerPort) {
		pdfjs.GlobalWorkerOptions.workerPort = new Worker(
			new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
			{ type: 'module' }
		);
	}

	return pdfjs;
};

/**
 * Draws every page onto a canvas of its own, at the width the container has
 * and the pixel density the screen has, so the text is sharp on a phone.
 */
const drawPages = async (data: ArrayBuffer, container: HTMLDivElement, cancelled: () => boolean) => {
	const pdfjs = await loadPdfJs();
	const task = pdfjs.getDocument({ data });
	const doc = await task.promise;

	try {
		const scale = window.devicePixelRatio || 1;
		const width = container.clientWidth;

		for (let number = 1; number <= doc.numPages && !cancelled(); number++) {
			const page = await doc.getPage(number);
			const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * scale });
			const canvas = document.createElement('canvas');

			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			canvas.setAttribute('role', 'img');
			canvas.setAttribute('aria-label', `Page ${number} of ${doc.numPages}`);
			canvas.className = stylex.props(styles.page).className ?? '';

			await page.render({ canvas, viewport }).promise;

			if (!cancelled()) container.append(canvas);
		}
	} finally {
		await task.destroy();
	}
};

/**
 * A PDF drawn by the app rather than by the browser.
 *
 * This was an `<iframe>` of the file at first, which only works where the
 * browser has a PDF viewer it will put in a frame. Desktop browsers do. Safari
 * on an iPhone paints the frame white, so does the installed app, and Chrome on
 * Android draws nothing. Between them that is most of the people who open a
 * receipt.
 */
const PdfPreview = ({ blob, title }: { blob: Blob; title: string }) => {
	const container = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<'drawing' | 'done' | 'failed'>('drawing');

	useEffect(() => {
		const target = container.current;
		if (!target) return;

		let cancelled = false;
		setState('drawing');

		blob.arrayBuffer()
			.then(data => drawPages(data, target, () => cancelled))
			.then(() => !cancelled && setState('done'))
			.catch(() => !cancelled && setState('failed'));

		return () => {
			cancelled = true;
			target.replaceChildren();
		};
	}, [blob]);

	return (
		<div role='document' aria-label={title} aria-busy={state === 'drawing'} {...stylex.props(styles.pages)}>
			{state === 'drawing' && <p {...stylex.props(styles.status)}>Drawing the pages…</p>}
			{state === 'failed' && (
				<p {...stylex.props(styles.status)}>This PDF can&apos;t be shown here. Download it to open it.</p>
			)}
			<div ref={container} {...stylex.props(styles.pages)} />
		</div>
	);
};

export default PdfPreview;
