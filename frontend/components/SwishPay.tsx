'use client';

import { QRCodeSVG } from 'qrcode.react';
import { formatSek } from '@shared/format';
import { swishAppUrl, toLocal } from '@shared/swish';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';

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
		<section className='glass space-y-4 rounded-2xl p-5'>
			<div>
				<h2 className='text-ink font-semibold'>Pay with Swish</h2>
				<p className='text-faint mt-1 text-xs leading-relaxed'>
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
			<div className='flex justify-center'>
				<div className='w-full max-w-[260px] rounded-xl bg-white p-3' data-testid='swish-qr'>
					<QRCodeSVG
						value={appUrl}
						size={260}
						level='H'
						marginSize={0}
						className='h-auto w-full'
						imageSettings={{ src: '/qr-mark.svg', height: 46, width: 46, excavate: true }}
					/>
				</div>
			</div>

			<dl className='text-xs'>
				<div className='flex justify-between gap-3 py-1'>
					<dt className='text-faint'>Reference</dt>
					<dd className='text-ink truncate font-medium'>{message}</dd>
				</div>
			</dl>

			<div className='flex gap-3'>
				{/* A plain `<a>`, not a `Button`: handing the link to the app needs
				    real navigation, and an anchor nested inside a `<button>` is
				    invalid HTML that browsers handle inconsistently. Shown only
				    where a finger is the pointer, because a desktop click lands on
				    Swish's download page, which is not what somebody standing in
				    front of the QR code came for. `pointer: coarse` rather than
				    sniffing the user agent, which is why this needs an e2e test at
				    both viewports. */}
				<a
					href={appUrl}
					data-testid='swish-open'
					className='glass-card text-ink hover:text-ink hidden h-11 w-full items-center justify-center rounded-xl text-sm transition-all duration-150 active:scale-[0.98] pointer-coarse:inline-flex'
				>
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

			<p className='text-faint text-xs leading-relaxed'>
				Paying does not tick anything off by itself. An admin marks it once the money has landed.
			</p>
		</section>
	);
};

export default SwishPay;
