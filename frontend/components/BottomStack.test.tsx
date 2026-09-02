import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { stylesFor, stylesOf } from '../test/stylex';
import BottomStackHost, { BottomSlot } from './BottomStack';

const expected = stylex.create({ first: { order: 1 }, third: { order: 3 } });

describe('BottomStack', () => {
	// Three things want the bottom of the screen and they live in three
	// different subtrees, so they reach one container by portal rather than by
	// being children of it.
	it('puts everything into the one host, whatever subtree asked', () => {
		render(
			<div>
				<div>
					<BottomSlot order={1}>
						<p>update</p>
					</BottomSlot>
				</div>
				<BottomStackHost />
				<BottomSlot order={3}>
					<p>toast</p>
				</BottomSlot>
			</div>
		);

		const host = document.getElementById('bottom-stack')!;

		expect(host).toContainElement(screen.getByText('update'));
		expect(host).toContainElement(screen.getByText('toast'));
	});

	// Portals land in whatever order they happen to mount, which is not
	// something to leave to chance when one of these is a build waiting to be
	// installed and another is a nudge that has been waiting weeks.
	it('orders its occupants rather than taking them as they arrive', () => {
		render(
			<>
				<BottomStackHost />
				<BottomSlot order={3}>
					<p>toast</p>
				</BottomSlot>
				<BottomSlot order={1}>
					<p>update</p>
				</BottomSlot>
			</>
		);

		expect(stylesOf(screen.getByText('update').parentElement)).toEqual(
			expect.arrayContaining(stylesFor(expected.first))
		);
		expect(stylesOf(screen.getByText('toast').parentElement)).toEqual(
			expect.arrayContaining(stylesFor(expected.third))
		);
	});

	it('draws nothing at all when there is no host to draw into', () => {
		render(
			<BottomSlot order={1}>
				<p>orphan</p>
			</BottomSlot>
		);

		expect(screen.queryByText('orphan')).not.toBeInTheDocument();
	});
});
