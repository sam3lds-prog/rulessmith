import { Redirect } from 'expo-router';

/** Old address of the main screen (before Play). Kept so saved links still work. */
export default function Today() {
  return <Redirect href="/play" />;
}
