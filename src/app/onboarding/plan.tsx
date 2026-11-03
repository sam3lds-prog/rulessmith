import { Redirect, router } from 'expo-router';
import { config } from '../../config';
import { addDays, dayKey, parseDay } from '../../engine/time';
import { policyFor } from '../../policy/age';
import { useApp } from '../../state/store';
import { Button, Gap, Screen, Small, Title } from '../../ui/kit';
import { PlanView } from '../../ui/PlanView';
import { space } from '../../ui/theme';
import { useNow } from '../../ui/useNow';

export default function OnboardingPlan() {
  const profile = useApp((s) => s.profile);
  const plan = useApp((s) => s.plan);
  const skills = useApp((s) => s.skills);
  const update = useApp((s) => s.updateProfileAndReplan);
  const saveOnDevice = useApp((s) => s.saveOnDevice);
  const now = useNow();
  if (!profile || !plan) return <Redirect href="/" />;

  const cloud = !!config.supabaseUrl && policyFor(profile.ageBand).canCreateAccount;
  const save = () => {
    saveOnDevice();
    router.replace(cloud ? '/account' : '/today');
  };

  return (
    <Screen footer={<Button title="Save my plan" onPress={save} />}>
      <Gap h={space.lg} />
      <Title>Here's your plan</Title>
      <Gap />
      <PlanView
        plan={plan}
        skills={skills}
        now={now}
        onAlternative={(a) => {
          if (a.kind === 'more-time') update({ minutesPerDay: a.minutesPerDay });
          if (a.kind === 'later-date') update({ testDate: a.date });
        }}
      />
      <Gap />
      <Small>
        {cloud
          ? 'Saving creates a free account so your plan syncs across devices.'
          : 'Your plan is saved on this device. Syncing across devices comes with accounts.'}
      </Small>
      {profile.testDate ? (
        <Button
          title="My test is later than this"
          kind="quiet"
          onPress={() => update({ testDate: dayKey(addDays(parseDay(profile.testDate!), 28)) })}
        />
      ) : null}
    </Screen>
  );
}
