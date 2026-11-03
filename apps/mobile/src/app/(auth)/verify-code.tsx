import { Redirect, useLocalSearchParams } from 'expo-router';

import { EmailAddressSchema } from '@/features/account/sign-in-code';
import { VerifyCodeScreen } from '@/features/account/verify-code-screen';

export default function VerifyCodeRoute() {
  // Route params can come from a deep link, so check them like any other input.
  const email = EmailAddressSchema.safeParse(useLocalSearchParams().email);
  if (!email.success) return <Redirect href="/sign-in" />;

  return <VerifyCodeScreen email={email.data} />;
}
