'use client';

import { QRCodeSVG } from 'qrcode.react';
import { formatSek } from '@shared/format';
import { swishAppUrl, swishQrPayload, toLocal } from '@shared/swish';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';

/**
 * Paying, without anybody retyping a phone number at the side of a pitch.
 *
 * Two routes to the same payment, and the split between them is about how much
 * each one can be trusted. The QR code is built from the published Swish QR
 * specification, so it is always drawn and always the way out. The `swish://`
 * link is reverse-engineered, works on every phone anybody here has tried it on
 * and could stop working with an app update nobody tells us about, so it is an
 * extra button rather than the mechanism.
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

	const payload = swishQrPayload({ payee, amount, message });
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
			    so an inverted code reads on some phones and not others. */}
			<div className='flex justify-center'>
				<div className='rounded-xl bg-white p-3' data-testid='swish-qr'>
					<QRCodeSVG value={payload} size={180} level='M' marginSize={0} />
				</div>
			</div>

			<dl className='text-xs'>
				<div className='flex justify-between gap-3 py-1'>
					<dt className='text-faint'>Reference</dt>
					<dd className='text-ink truncate font-medium'>{message}</dd>
				</div>
			</dl>

			<div className='flex gap-3'>
				{/* A plain `<a>`, not a `Button`: `swish://` needs real navigation,
				    and an anchor nested inside a `<button>` is invalid HTML that
				    browsers handle inconsistently. Shown only where a finger is
				    the pointer, because a desktop click on this goes nowhere and
				    says nothing. `pointer: coarse` rather than sniffing the user
				    agent, which is why this needs an e2e test at both viewports. */}
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
