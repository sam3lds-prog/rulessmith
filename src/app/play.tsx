import { Redirect } from 'expo-router';

/** Old address of the main screen (before Today). Kept so saved links still work. */
export default function Play() {
  return <Redirect href="/today" />;
}
