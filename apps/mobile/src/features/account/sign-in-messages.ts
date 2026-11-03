import { SignInError, type SignInErrorKind } from '@/account/account-auth';

const MESSAGES: Record<SignInErrorKind, string> = {
  'invalid-email': "That doesn't look like an email address. Please check it and try again.",
  'invalid-code': "That code didn't work. It may have expired, so you can send a new one.",
  'rate-limited': 'Please wait a moment before trying again.',
  network: "We couldn't connect. Please check your internet connection and try again.",
  unknown: 'Something went wrong on our side. Please try again.',
};

export function signInMessage(kind: SignInErrorKind): string {
  return MESSAGES[kind];
}

/** A calm, specific message for anything a sign-in call throws. */
export function signInErrorMessage(error: unknown): string {
  return signInMessage(error instanceof SignInError ? error.kind : 'unknown');
}
