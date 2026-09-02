'use client';

import { QRCodeSVG } from 'qrcode.react';
import * as stylex from '@stylexjs/stylex';
import { formatSek } from '@shared/format';
import { swishAppUrl, toLocal } from '@shared/swish';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';
import { bp, colors } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';

const styles = stylex.create({
	card: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	blurb: { color: colors.faint, marginTop: 4, fontSize: 12, lineHeight: 1.625 },

	codeRow: { display: 'flex', justifyContent: 'center' },
	plate: { backgroundColor: 'white', width: '100%', maxWidth: 260, borderRadius: 12, padding: 12 },
	code: { width: '100%', height: 'auto' },

	facts: { fontSize: 12, lineHeight: '16px' },
	fact: { display: 'flex', justifyContent: 'space-between', gap: 12, paddingBlock: 4 },
	label: { color: colors.faint },
	value: { color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },

	actions: { display: 'flex', gap: 12 },
	open: {
		color: colors.ink,
		display: { default: 'none', [bp.coarse]: 'inline-flex' },
		height: 44,
		width: '100%',
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		fontSize: 14,
		lineHeight: '20px',
		transitionDuration: '0.15s',
		transform: { default: null, ':active': 'scale(0.98)' },
	},

	footnote: { color: colors.faint, fontSize: 12, lineHeight: 1.625 },
});

/**
 * Paying, without anybody retyping a phone number at the side of a pitch.
 *
 * Two routes to the same payment, carrying the same string. The code used to
 * hold the payload out of the Swish QR specification, `C0701234567;1736;...;0`,
 * which is a line of text and not a URL. A phone camera reads it, finds nothing
 * to open and offers nothing, so the only scanner it ever worked in was Swish's
 * own. A camera can act on a URL, so the code and the button now hand over the
 * same link.
 *
 * Both are pure string building. Nothing calls Swish, which matters twice: the
 * CSP does not let the browser reach `mpc.getswish.net`, and a payment screen
 * that depends on a third party's HTTP call is a payment screen that fails at
 * the pitch.
 *
 * The QR renders as real React `<path>` elements rather than injected markup.
 * `next.config.js` claims as a security property that this app contains no
 * `dangerouslySetInnerHTML`, and a QR library that hands back an SVG string
 * would have quietly cost us that.
 */
const SwishPay = ({ payee, amount, message }: { payee: string; amount: number; message: string }) => {
	const write = useWrite();

	const appUrl = swishAppUrl({ payee, amount, message });

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div>
				<h2 {...stylex.props(styles.title)}>Pay with Swish</h2>
				<p {...stylex.props(styles.blurb)}>
					{formatSek(amount)} to {toLocal(payee)}. The amount and the reference are already in the code, so
					there is nothing to type.
				</p>
			</div>

			{/* White plate under the code on purpose. The app is permanently dark
			    and a scanner needs the quiet zone to be lighter than the modules,
			    so an inverted code reads on some phones and not others.

			    The mark in the middle costs error correction, because `excavate`
			    clears the modules underneath it rather than drawing over them, so
			    the level goes to H and the code gets bigger to pay for it. A
			    reference at the 50 character limit is 65 modules across at H
			    against 49 at the M this used to run: at a fixed 200 pixels that
			    is a three pixel module, which is under what a phone camera reads
			    reliably at arm's length. So the code takes the width it is given
			    up to 260 rather than a pinned number, which is four pixels a
			    module on a phone in the worst case and better in every other.
			    Scanning it back is the entire job.

			    46 of those 260 is a mark covering about 3% of the modules, well
			    inside the 30% H recovers. Making it bigger looks better on a
			    screen and is exactly the wrong trade at the side of a pitch. */}
			<div {...stylex.props(styles.codeRow)}>
				<div {...stylex.props(styles.plate)} data-testid='swish-qr'>
					<QRCodeSVG
						value={appUrl}
						size={260}
						level='H'
						marginSize={0}
						{...stylex.props(styles.code)}
						imageSettings={{ src: '/qr-mark.svg', height: 46, width: 46, excavate: true }}
					/>
				</div>
			</div>

			<dl {...stylex.props(styles.facts)}>
				<div {...stylex.props(styles.fact)}>
					<dt {...stylex.props(styles.label)}>Reference</dt>
					<dd {...stylex.props(styles.value)}>{message}</dd>
				</div>
			</dl>

			<div {...stylex.props(styles.actions)}>
				{/* A plain `<a>`, not a `Button`: handing the link to the app needs
				    real navigation, and an anchor nested inside a `<button>` is
				    invalid HTML that browsers handle inconsistently. Shown only
				    where a finger is the pointer, because a desktop click lands on
				    Swish's download page, which is not what somebody standing in
				    front of the QR code came for. `pointer: coarse` rather than
				    sniffing the user agent, which is why this needs an e2e test at
				    both viewports. */}
				<a href={appUrl} data-testid='swish-open' {...stylex.props(surfaces.glassCard, styles.open)}>
					Open Swish
				</a>

				<Button
					variant='secondary'
					fullWidth
					onClick={() =>
						write(() => navigator.clipboard.writeText(toLocal(payee)), "Couldn't copy the number.")
					}
				>
					Copy number
				</Button>
			</div>

			<p {...stylex.props(styles.footnote)}>
				Paying does not tick anything off by itself. An admin marks it once the money has landed.
			</p>
		</section>
	);
};

export default SwishPay;
