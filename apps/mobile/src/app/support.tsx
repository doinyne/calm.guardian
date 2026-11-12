import { useRouter } from 'expo-router';

import { SupportScreen } from '@/features/support/support-screen';

/** Outside the signed-in and signed-out groups, so anyone can reach it, at any time. */
export default function SupportRoute() {
  const router = useRouter();
  return (
    <SupportScreen onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
  );
}
