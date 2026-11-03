import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAccountAuth } from '@/account/account-session';
import { FormScreen } from '@/components/form-screen';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { RESEND_CODE_AFTER_SECONDS, SIGN_IN_CODE_LENGTH } from './sign-in-code';
import { signInErrorMessage } from './sign-in-messages';
import { useCountdown } from './use-countdown';

/**
 * Step 2 of signing in: enter the emailed code. Once it's accepted the session changes and the
 * navigator takes the user into the app; this screen doesn't navigate itself.
 */
export function VerifyCodeScreen({ email }: { email: string }) {
  const auth = useAccountAuth();
  const router = useRouter();
  const [code, setCode] = useState('');
  const resendCountdown = useCountdown(RESEND_CODE_AFTER_SECONDS);

  const verify = useMutation({
    mutationFn: (enteredCode: string) => auth.verifySignInCode({ email, code: enteredCode }),
  });

  const resend = useMutation({
    mutationFn: () => auth.sendSignInCode(email),
    onSuccess: () => {
      resendCountdown.restart();
      setCode('');
      verify.reset();
    },
  });

  function changeCode(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, SIGN_IN_CODE_LENGTH);
    setCode(digits);
    if (digits.length === SIGN_IN_CODE_LENGTH) verify.mutate(digits);
  }

  const problem = verify.error ?? resend.error;
  const canResend = resendCountdown.secondsLeft === 0 && !resend.isPending;

  return (
    <FormScreen
      step="Sign in · Step 2 of 2"
      title="Check your email"
      description={`Enter the ${SIGN_IN_CODE_LENGTH}-digit code we sent to ${email}.`}
    >
      <TextField
        label="Sign-in code"
        value={code}
        onChangeText={changeCode}
        error={problem && signInErrorMessage(problem)}
        editable={!verify.isPending}
        autoFocus
        maxLength={SIGN_IN_CODE_LENGTH}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
      />
      <Button
        size="lg"
        onPress={() => verify.mutate(code)}
        disabled={code.length !== SIGN_IN_CODE_LENGTH || verify.isPending}
      >
        <Text>{verify.isPending ? 'Checking…' : 'Continue'}</Text>
      </Button>
      <View className="gap-2">
        <Button
          variant="ghost"
          onPress={() => resend.mutate()}
          disabled={!canResend}
          aria-label={
            canResend
              ? 'Send a new code'
              : `Send a new code in ${resendCountdown.secondsLeft} seconds`
          }
        >
          <Text>
            {canResend ? 'Send a new code' : `Send a new code in ${resendCountdown.secondsLeft}s`}
          </Text>
        </Button>
        <Button variant="ghost" onPress={() => router.dismissTo('/sign-in')}>
          <Text>Use a different email</Text>
        </Button>
      </View>
    </FormScreen>
  );
}
