import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAccountAuth } from '@/account/account-session';
import { FormScreen } from '@/components/form-screen';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { EmailAddressSchema, SIGN_IN_CODE_LENGTH } from './sign-in-code';
import { signInErrorMessage, signInMessage } from './sign-in-messages';

/** Step 1 of signing in: ask for an email address and send a code to it. */
export function SignInScreen() {
  const auth = useAccountAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isEmailInvalid, setIsEmailInvalid] = useState(false);

  const sendCode = useMutation({
    mutationFn: (address: string) => auth.sendSignInCode(address),
    onSuccess: (_result, address) =>
      router.push({ pathname: '/verify-code', params: { email: address } }),
  });

  function submit() {
    const address = EmailAddressSchema.safeParse(email);
    setIsEmailInvalid(!address.success);
    if (address.success) sendCode.mutate(address.data);
  }

  const problem = isEmailInvalid
    ? signInMessage('invalid-email')
    : sendCode.error && signInErrorMessage(sendCode.error);

  return (
    <FormScreen
      step="Sign in · Step 1 of 2"
      title="What's your email?"
      description={`We'll email you a ${SIGN_IN_CODE_LENGTH}-digit code to sign in. There's no password to remember.`}
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
        error={problem}
        editable={!sendCode.isPending}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="send"
      />
      <Button size="lg" onPress={submit} disabled={sendCode.isPending}>
        <Text>{sendCode.isPending ? 'Sending…' : 'Send code'}</Text>
      </Button>
    </FormScreen>
  );
}
