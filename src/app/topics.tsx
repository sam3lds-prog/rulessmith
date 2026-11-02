import { Redirect } from 'expo-router';

/** Old address of the Topics tab. Topics now live on Practice. Kept so saved links still work. */
export default function Topics() {
  return <Redirect href="/practice" />;
}
