import { Redirect } from 'expo-router';

/**
 * Bluesky's return into the app. On iOS the sign-in sheet catches it; on Android it can also arrive
 * as a link. Either way the connect flow already has the result, so this route just goes home.
 */
export default function ConnectBlueskyReturnRoute() {
  return <Redirect href="/" />;
}
