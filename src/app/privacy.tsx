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
      <Body>Your answers to the setup questions, your plan, and your practice results: which puzzles you answered, whether you were right, whether you used a hint, and how long it took. That is what the plan and the mastery rules run on.</Body>
      <Gap />
      <Heading>Where it lives</Heading>
      <Body>On this device. If you create an account, a copy syncs to our database so it follows you to other devices.</Body>
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
