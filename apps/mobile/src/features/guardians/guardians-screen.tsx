import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { THEME_COLORS } from '@calm-guardian/shared';

import { ErrorMessage } from '@/components/error-message';
import { HeaderScrollView } from '@/components/header-scroll-view';
import { MonoLabel } from '@/components/mono-label';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { EmailAddressSchema } from '@/features/account/sign-in-code';
import { useCalmStatus } from '@/features/calm/use-calm';

import {
  useGuardians,
  useInviteGuardian,
  useRemoveGuardian,
  useSetGuardiansCanTurnOn,
  type InviteOutcome,
} from './use-guardians';

const INVITE_PROBLEM: Record<Exclude<InviteOutcome, 'invited'>, string> = {
  'limit-reached': 'You have as many Guardians as you can. Remove one to invite someone new.',
  yourself: "That's your own email address. Please invite someone you trust.",
};

/**
 * The user's Guardians (ADR-0011): people they trust to turn Calm Mode on for them. The user decides
 * who, and for which accounts, and can change either at any time.
 */
export function GuardiansScreen() {
  const guardians = useGuardians();
  const status = useCalmStatus();
  const invite = useInviteGuardian();
  const remove = useRemoveGuardian();
  const setPermission = useSetGuardiansCanTurnOn();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const list = guardians.data?.guardians ?? [];
  const max = guardians.data?.max ?? 0;
  const accounts = status.data ?? [];

  const sendInvite = () => {
    const parsed = EmailAddressSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError('Please enter an email address, like name@example.com.');
      return;
    }
    setEmailError(null);
    invite.mutate(parsed.data, {
      onSuccess: (outcome) => {
        if (outcome === 'invited') setEmail('');
      },
    });
  };

  const confirmRemove = (id: string, address: string) =>
    Alert.alert(
      `Remove ${address}?`,
      "They won't be able to turn on Calm Mode for you any more, and won't get emails about it.",
      [
        { text: 'Keep them', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(id) },
      ],
    );

  return (
    <HeaderScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-6 pt-4">
      <Text className="text-muted-foreground">
        A Guardian is someone you trust. They can turn on Calm Mode for the accounts you choose, and
        they&apos;re told when it&apos;s on. They never see your posts, and you can always turn it
        off.
      </Text>

      <View className="gap-3">
        <View role="heading">
          <MonoLabel>{`Your Guardians · ${list.length} of ${max}`}</MonoLabel>
        </View>
        {guardians.isSuccess && list.length === 0 ? (
          <Text className="text-muted-foreground">No Guardians yet.</Text>
        ) : null}
        {list.map((guardian) => (
          <View
            key={guardian.id}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <View className="flex-1 gap-1">
              <Text>{guardian.email}</Text>
              <MonoLabel tone={guardian.state === 'active' ? 'primary' : 'muted'}>
                {guardian.state === 'active' ? 'Guardian' : 'Invited'}
              </MonoLabel>
            </View>
            <Button
              variant="ghost"
              onPress={() => confirmRemove(guardian.id, guardian.email)}
              aria-label={`Remove ${guardian.email}`}
            >
              <Text>Remove</Text>
            </Button>
          </View>
        ))}
      </View>

      {list.length < max ? (
        <View className="gap-3">
          <TextField
            label="Invite a Guardian by email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            error={emailError}
          />
          <Button onPress={sendInvite} disabled={invite.isPending}>
            <Text>{invite.isPending ? 'Inviting…' : 'Send invitation'}</Text>
          </Button>
          {invite.data && invite.data !== 'invited' ? (
            <ErrorMessage>{INVITE_PROBLEM[invite.data]}</ErrorMessage>
          ) : null}
          {invite.data === 'invited' ? (
            <Text className="text-muted-foreground">
              Invitation sent. They accept by signing in to Calm Guardian with that address.
            </Text>
          ) : null}
          {invite.error ? (
            <ErrorMessage>We couldn&apos;t send that. Please try again.</ErrorMessage>
          ) : null}
        </View>
      ) : null}

      {accounts.length > 0 ? (
        <View className="gap-3">
          <View role="heading">
            <MonoLabel>What your Guardians can do</MonoLabel>
          </View>
          {accounts.map((account) => (
            <View
              key={account.id}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-1 gap-1">
                <Text>{`@${account.handle}`}</Text>
                <Text className="text-sm text-muted-foreground">Can turn on Calm Mode</Text>
              </View>
              <Switch
                value={account.guardiansCanTurnOn}
                onValueChange={(allowed) =>
                  setPermission.mutate({ connectedAccountId: account.id, allowed })
                }
                trackColor={{ true: THEME_COLORS.primary, false: THEME_COLORS.muted }}
                aria-label={`Guardians can turn on Calm Mode for @${account.handle}`}
              />
            </View>
          ))}
          {setPermission.error ? (
            <ErrorMessage>We couldn&apos;t change that. Please try again.</ErrorMessage>
          ) : null}
        </View>
      ) : null}
    </HeaderScrollView>
  );
}
