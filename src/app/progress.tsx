import { Redirect } from 'expo-router';

/** Old address of the Progress tab. Skill status now lives on Plan's map. Kept so saved links still work. */
export default function Progress() {
  return <Redirect href="/plan" />;
}
