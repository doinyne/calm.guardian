import { useLocalSearchParams, useRouter } from 'expo-router';

import { TurnOnCalmScreen } from '@/features/calm/turn-on-calm-screen';

/** `/calm/all`, or `/calm/<connected account id>`. */
export default function TurnOnCalmRoute() {
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <TurnOnCalmScreen
      target={target === 'all' ? 'all' : { connectedAccountId: target }}
      onDone={close}
    />
  );
}
