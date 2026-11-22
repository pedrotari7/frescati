import Button from './Button';
import DatePicker from './DatePicker';
import { Field } from './Field';
import Toggle from './Toggle';

/**
 * The two settings of a season that is signing up: when it closes and whether
 * it makes any noise. Shared by the new-season form and a draft's admin page,
 * so the wording and the way to clear the date stay one thing.
 *
 * `DatePicker` cannot clear a value, so the date has a button of its own.
 */
const SignupSettingsFields = ({
	signupClosesOn,
	onClosesOn,
	quiet,
	onQuiet,
}: {
	signupClosesOn: string;
	onClosesOn: (date: string) => void;
	quiet: boolean;
	onQuiet: (quiet: boolean) => void;
}) => (
	<>
		<Field label='Sign-up closes' hint='Optional. Reminders stop after this day.'>
			<DatePicker value={signupClosesOn} onChange={onClosesOn} placeholder='No closing date' />
		</Field>

		{signupClosesOn && (
			<Button variant='secondary' fullWidth onClick={() => onClosesOn('')}>
				Remove closing date
			</Button>
		)}

		<Toggle
			label="Don't notify anyone"
			description='Set the season up quietly. Nobody is asked to sign up until you turn this off.'
			checked={quiet}
			onChange={onQuiet}
		/>
	</>
);

export default SignupSettingsFields;
