import { Redirect } from 'expo-router';
import { useApp } from '../state/store';

export default function Index() {
  const profile = useApp((s) => s.profile);
  const plan = useApp((s) => s.plan);
  const active = useApp((s) => s.active);
  if (!profile) return <Redirect href="/welcome" />;
  if (!plan) return <Redirect href="/onboarding/placement" />;
  if (active) return <Redirect href="/session" />;
  return <Redirect href="/play" />;
}
