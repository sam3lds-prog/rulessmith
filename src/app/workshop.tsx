import { Redirect } from 'expo-router';

/** The workshop was removed; its old address opens Progress so saved links still work. */
export default function Workshop() {
  return <Redirect href="/progress" />;
}
