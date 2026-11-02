import { APP_NAME } from '../config';
import { BackLink, Body, Gap, Heading, Screen, Small, Title } from '../ui/kit';
import { space } from '../ui/theme';

/**
 * Plain-language privacy summary. This is a draft for the app, not the legal
 * privacy policy; have a lawyer review the full policy before launch.
 */
export default function Privacy() {
  return (
    <Screen>
      <BackLink />
      <Title>Privacy</Title>
      <Gap />
      <Heading>What {APP_NAME} stores</Heading>
      <Body>Your answers to the setup questions, your plan, and your practice results: which puzzles you answered, what you answered, whether you were right, whether the rule was on screen or you used a hint, and how long the puzzle was open. That is what the plan and the mastery rules run on.</Body>
      <Gap />
      <Heading>Where it lives</Heading>
      <Body>On this device. If you create an account, a copy syncs to our database so it follows you to other devices. Signing out removes it from this device's screen; it stays in your account. Progress saved before you signed in joins your account only if you choose to add it.</Body>
      <Gap />
      <Heading>Usage events</Heading>
      <Body>The app sends short usage events, such as "finished a session" or "answered a puzzle", so we can see whether the app helps and fix puzzles that don't work. For adults they carry an id for this install and, if you're signed in, your account. For anyone under 18, or before you've told us your age, they carry no id.</Body>
      <Gap />
      <Heading>Ads</Heading>
      <Body>Ads are only ever shown to adults on the free plan, and they are not personalized unless you allow tracking on your device. Learners under 18 never see ads.</Body>
      <Gap />
      <Heading>Learners under 18</Heading>
      <Body>Teen profiles keep progress on the device, with no ads and no purchases. Under-13s need a parent account, which is coming.</Body>
      <Gap />
      <Heading>Deleting</Heading>
      <Body>You can delete everything from the You tab at any time. Deleting an account removes its synced data too.</Body>
      <Gap h={space.xl} />
      <Small>Draft summary. The full privacy policy will be published before launch.</Small>
    </Screen>
  );
}
