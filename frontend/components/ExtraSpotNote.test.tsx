import { render, screen } from '@testing-library/react';
import type { GameResponse } from '@shared/types';
import ExtraSpotNote from './ExtraSpotNote';

const response = (overrides: Partial<GameResponse>): GameResponse => ({
	uid: 'me',
	status: 'in',
	role: 'extra',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

describe('ExtraSpotNote', () => {
	it('says an answer is waiting on an admin', () => {
		render(<ExtraSpotNote isExtra myResponse={response({})} lifecycle='open' />);

		expect(screen.getByText('Waiting on a spot.')).toBeInTheDocument();
	});

	it('says so once an admin has given them the spot', () => {
		render(<ExtraSpotNote isExtra myResponse={response({ confirmOverride: true })} lifecycle='open' />);

		expect(screen.getByText("You're in.")).toBeInTheDocument();
		expect(screen.getByText(/count towards the headcount/)).toBeInTheDocument();
	});

	// The answer to "did that work?" is worth more once it is too late to change
	// it, not less — the buttons are dead by then, so the note is all there is.
	it('keeps saying where they stand after answers have closed', () => {
		render(<ExtraSpotNote isExtra myResponse={response({})} lifecycle='locked' />);

		expect(screen.getByText('Waiting on a spot.')).toBeInTheDocument();
	});

	it('explains what will happen before they have answered', () => {
		render(<ExtraSpotNote isExtra myResponse={undefined} lifecycle='open' />);

		expect(screen.getByText(/listed as an extra/)).toBeInTheDocument();
	});

	// Describing a queue nobody can join any more.
	it('says nothing about a game they never answered and now cannot', () => {
		const { container } = render(<ExtraSpotNote isExtra myResponse={undefined} lifecycle='locked' />);

		expect(container).toBeEmptyDOMElement();
	});

	it('says nothing to a squad member', () => {
		const { container } = render(
			<ExtraSpotNote isExtra={false} myResponse={response({ role: 'member' })} lifecycle='open' />
		);

		expect(container).toBeEmptyDOMElement();
	});

	// Nothing is pending for somebody who said no — but the In button beside
	// this is still live, so what it would do is still worth saying.
	it('is back to explaining the queue for an extra who answered out', () => {
		render(<ExtraSpotNote isExtra myResponse={response({ status: 'out' })} lifecycle='open' />);

		expect(screen.queryByText('Waiting on a spot.')).not.toBeInTheDocument();
		expect(screen.getByText(/listed as an extra/)).toBeInTheDocument();
	});

	/**
	 * `role` is snapshotted on the response and is what the headcount tallies,
	 * so somebody added to the squad after answering really is still queued as
	 * an extra on this game. Reading `isExtra` instead would leave them waiting
	 * on a spot with nothing on screen saying so.
	 */
	it('still reports a pending spot to somebody since added to the squad', () => {
		render(<ExtraSpotNote isExtra={false} myResponse={response({})} lifecycle='open' />);

		expect(screen.getByText('Waiting on a spot.')).toBeInTheDocument();
	});
});
