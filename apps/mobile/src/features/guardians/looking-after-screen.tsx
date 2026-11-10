import type { CalmPeriodPreset } from '@calm-guardian/shared';
import { Alert, View } from 'react-native';

import { ErrorMessage } from '@/components/error-message';
import { HeaderScrollView } from '@/components/header-scroll-view';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PERIOD_LABEL } from '@/features/calm/calm-copy';

import {
  useAcceptInvitation,
  useGuardianInvitations,
  useGuardianTurnOn,
  useProtecting,
  useStepDown,
  type Protected,
} from './use-guardians';

type ProtectedAccount = Protected['connectedAccounts'][number];

const CALM_READOUT: Record<ProtectedAccount['calm'], string> = {
  off: 'Calm Mode is off',
  'turning-on': 'Calm Mode is turning on',
  on: 'Calm Mode is on',
};

/** Why the button isn't there. Never a reason for Calm Mode, never anything about posts (product rule 3). */
const WHY_NOT: Record<Exclude<ProtectedAccount['canTurnOn'], 'yes' | 'already-on'>, string> = {
  'review-waiting':
    "They have hidden posts to look through first. You can turn it on again once they've done that.",
  'needs-sign-in': 'This account needs signing in again before Calm Mode can turn on.',
};

/** The periods a Guardian can choose: recent ones, since they're acting on the user's behalf. */
const GUARDIAN_PERIODS: readonly CalmPeriodPreset[] = [
  'last-24-hours',
  'last-7-days',
  'last-30-days',
];

/**
 * Being someone's Guardian (ADR-0011): invitations to accept, and the accounts you may turn Calm Mode
 * on for. There is deliberately nothing here to turn it off, or to see posts.
 */
export function LookingAfterScreen() {
  const invitations = useGuardianInvitations();
  const protecting = useProtecting();
  const accept = useAcceptInvitation();
  const stepDown = useStepDown();
  const turnOn = useGuardianTurnOn();

  const confirmTurnOn = (account: ProtectedAccount, who: string) =>
    Alert.alert(
      `Turn on Calm Mode for @${account.handle}?`,
      `Their recent posts will be backed up and hidden. ${who} will be told straight away, and can turn it off whenever they like. How far back?`,
      [
        ...GUARDIAN_PERIODS.map((period) => ({
          text: PERIOD_LABEL[period],
          onPress: () => turnOn.mutate({ connectedAccountId: account.connectedAccountId, period }),
        })),
        { text: 'Not now', style: 'cancel' as const },
      ],
    );

  const confirmStepDown = (id: string, who: string) =>
    Alert.alert(
      `Stop being ${who}'s Guardian?`,
      "You won't be able to turn on Calm Mode for them.",
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Step down', style: 'destructive', onPress: () => stepDown.mutate(id) },
      ],
    );

  const nobody =
    invitations.isSuccess &&
    protecting.isSuccess &&
    invitations.data.length === 0 &&
    protecting.data.length === 0;

  return (
    <HeaderScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-6 pt-4">
      <Text className="text-muted-foreground">
        As a Guardian you can turn on Calm Mode for someone, which quietly hides their posts for a
        while. You never see their posts, and they can always turn it off.
      </Text>

      {nobody ? <Text>Nobody has asked you to be their Guardian yet.</Text> : null}

      {(invitations.data ?? []).map((invitation) => (
        <View key={invitation.id} className="gap-3 rounded-xl border border-hope bg-card p-4">
          <MonoLabel className="text-hope">Invitation</MonoLabel>
          <Text>{`${invitation.from} would like you to be one of their Guardians.`}</Text>
          <View className="flex-row gap-2">
            <Button onPress={() => accept.mutate(invitation.id)} disabled={accept.isPending}>
              <Text>Accept</Text>
            </Button>
            <Button
              variant="ghost"
              onPress={() => stepDown.mutate(invitation.id)}
              disabled={stepDown.isPending}
            >
              <Text>Decline</Text>
            </Button>
          </View>
        </View>
      ))}

      {(protecting.data ?? []).map((person) => (
        <View
          key={person.guardianshipId}
          className="gap-3 rounded-xl border border-border bg-card p-4"
        >
          <View role="heading">
            <MonoLabel>{person.accountEmail}</MonoLabel>
          </View>
          {person.connectedAccounts.length === 0 ? (
            <Text className="text-muted-foreground">
              They haven&apos;t chosen any accounts for you to look after yet.
            </Text>
          ) : null}
          {person.connectedAccounts.map((account) => (
            <View key={account.connectedAccountId} className="gap-2 border-t border-border pt-3">
              <Text className="font-semibold">{`@${account.handle}`}</Text>
              <MonoLabel tone={account.calm === 'off' ? 'muted' : 'primary'}>
                {CALM_READOUT[account.calm]}
              </MonoLabel>
              {account.canTurnOn === 'yes' ? (
                <Button
                  onPress={() => confirmTurnOn(account, person.accountEmail)}
                  disabled={turnOn.isPending}
                  aria-label={`Turn on Calm Mode for @${account.handle}`}
                >
                  <Text>Turn on Calm Mode</Text>
                </Button>
              ) : null}
              {account.canTurnOn === 'review-waiting' || account.canTurnOn === 'needs-sign-in' ? (
                <Text className="text-sm text-muted-foreground">{WHY_NOT[account.canTurnOn]}</Text>
              ) : null}
            </View>
          ))}
          <Button
            variant="ghost"
            onPress={() => confirmStepDown(person.guardianshipId, person.accountEmail)}
            aria-label={`Stop being ${person.accountEmail}'s Guardian`}
          >
            <Text>Step down</Text>
          </Button>
        </View>
      ))}

      {accept.error || stepDown.error || turnOn.error ? (
        <ErrorMessage>Something went wrong. Please try again.</ErrorMessage>
      ) : null}
    </HeaderScrollView>
  );
}
