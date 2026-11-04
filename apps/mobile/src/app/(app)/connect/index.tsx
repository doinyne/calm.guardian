import { useRouter } from 'expo-router';

import { publicEnv } from '@/config/env';
import { ConnectAccountScreen } from '@/features/connections/connect-account-screen';
import { upcomingPlatformsShownIn } from '@/features/connections/platforms';

const UPCOMING_PLATFORMS = upcomingPlatformsShownIn(publicEnv.appVariant);

export default function ConnectAccountRoute() {
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return <ConnectAccountScreen upcomingPlatforms={UPCOMING_PLATFORMS} onDone={close} />;
}
