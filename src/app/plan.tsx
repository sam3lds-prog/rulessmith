import { Redirect } from 'expo-router';
import { useApp } from '../state/store';
import { BackLink, Gap, Screen, Title } from '../ui/kit';
import { PlanView } from '../ui/PlanView';

export default function Plan() {
  const plan = useApp((s) => s.plan);
  const skills = useApp((s) => s.skills);
  const update = useApp((s) => s.updateProfileAndReplan);
  if (!plan) return <Redirect href="/" />;
  return (
    <Screen>
      <BackLink />
      <Title>Your plan</Title>
      <Gap />
      <PlanView
        plan={plan}
        skills={skills}
        now={Date.now()}
        onAlternative={(a) => {
          if (a.kind === 'more-time') update({ minutesPerDay: a.minutesPerDay });
          if (a.kind === 'later-date') update({ testDate: a.date });
        }}
      />
    </Screen>
  );
}
