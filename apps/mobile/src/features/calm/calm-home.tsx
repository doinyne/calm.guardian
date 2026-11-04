import { Alert, ScrollView, View } from 'react-native';

import { CalmCore, type CoreState } from '@/components/calm-core';
import { ErrorMessage } from '@/components/error-message';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { accountReadout, turnOffMessage } from './calm-copy';
import {
  useCalmStatus,
  useDisconnectAccount,
  useTurnOffCalm,
  type CalmAccount,
  type CalmTarget,
} from './use-calm';

type Overall = 'off' | 'turning-on' | 'on';

const HERO: Record<Overall, { core: CoreState; label: string; heading: string; body: string }> = {
  off: {
    core: 'standing-by',
    label: 'Standing by',
    heading: 'Calm Mode is off',
    body: 'Your posts are visible as usual.',
  },
  'turning-on': {
    core: 'on',
    label: 'Hiding posts',
    heading: 'Calm Mode is turning on',
    body: 'Each post is backed up, then hidden, newest first. It carries on if you close the app.',
  },
  on: {
    core: 'on',
    label: 'Calm Mode · On',
    heading: 'Calm Mode is on',
    body: 'Your hidden posts are safely backed up. Nothing is lost.',
  },
};

function overallOf(accounts: readonly CalmAccount[]): Overall {
  if (accounts.some((account) => account.calm?.state === 'activating')) return 'turning-on';
  if (accounts.some((account) => account.calm?.state === 'active')) return 'on';
  return 'off';
}

/**
 * Home: mission control. Calm Mode's state at a glance, then each connected account with its own
 * Calm control, and one for all of them (ADR-0011).
 */
export function CalmHome({
  onTurnOn,
  onConnect,
}: {
  onTurnOn: (target: CalmTarget) => void;
  onConnect: () => void;
}) {
  const status = useCalmStatus();
  const accounts = status.data ?? [];
  const hero = HERO[overallOf(accounts)];
  const canTurnOnForAll = accounts.length > 1 && accounts.some((account) => account.calm === null);

  return (
    <ScrollView contentContainerClassName="gap-6 pb-8">
      <View className="flex-row items-center gap-5">
        <CalmCore state={hero.core} size={112} />
        <View className="flex-1 gap-2">
          <MonoLabel tone={hero.core === 'on' ? 'primary' : 'muted'}>{hero.label}</MonoLabel>
          <Text variant="h3">{hero.heading}</Text>
          <Text className="text-muted-foreground">{hero.body}</Text>
        </View>
      </View>

      <View className="gap-4 rounded-xl border border-border bg-card p-5">
        <View className="flex-row items-center justify-between">
          <View role="heading">
            <MonoLabel>Connected accounts</MonoLabel>
          </View>
          {canTurnOnForAll ? (
            <Button variant="outline" onPress={() => onTurnOn('all')}>
              <Text>Turn on for all</Text>
            </Button>
          ) : null}
        </View>

        {status.isPending ? <Text className="text-muted-foreground">Loading…</Text> : null}
        {status.isError ? (
          <ErrorMessage>We couldn&apos;t load your accounts. Please try again.</ErrorMessage>
        ) : null}
        {status.isSuccess && accounts.length === 0 ? (
          <Text className="text-muted-foreground">
            No accounts connected yet. Connect one to turn on Calm Mode.
          </Text>
        ) : null}

        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onTurnOn={onTurnOn}
            onConnect={onConnect}
          />
        ))}

        <Button size="lg" variant={accounts.length > 0 ? 'outline' : 'default'} onPress={onConnect}>
          <Text>{accounts.length > 0 ? 'Connect another account' : 'Connect an account'}</Text>
        </Button>
      </View>
    </ScrollView>
  );
}

function AccountRow({
  account,
  onTurnOn,
  onConnect,
}: {
  account: CalmAccount;
  onTurnOn: (target: CalmTarget) => void;
  onConnect: () => void;
}) {
  const turnOff = useTurnOffCalm();
  const disconnect = useDisconnectAccount();
  const name = `@${account.handle}`;
  const needsSignIn = account.status === 'needs_reauth';

  const confirmTurnOff = (hidden: number) =>
    Alert.alert('Turn off Calm Mode?', turnOffMessage(hidden), [
      { text: 'Keep it on', style: 'cancel' },
      { text: 'Turn off', onPress: () => turnOff.mutate(account.id) },
    ]);

  return (
    <View className="gap-3 border-t border-border pt-4">
      <View className="gap-1">
        <Text className="font-semibold">{name}</Text>
        <MonoLabel tone={account.calm ? 'primary' : 'muted'}>{accountReadout(account)}</MonoLabel>
      </View>

      {account.calm === null && !needsSignIn ? (
        <View className="flex-row gap-3">
          <Button
            className="flex-1"
            onPress={() => onTurnOn({ connectedAccountId: account.id })}
            aria-label={`Turn on Calm Mode for ${name}`}
          >
            <Text>Turn on Calm Mode</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => disconnect.mutate(account.id)}
            disabled={disconnect.isPending}
            aria-label={`Disconnect ${name}`}
          >
            <Text>Disconnect</Text>
          </Button>
        </View>
      ) : null}

      {account.calm?.state === 'active' ? (
        <Button
          variant="outline"
          onPress={() => confirmTurnOff(account.calm?.hidden ?? 0)}
          disabled={turnOff.isPending}
          aria-label={`Turn off Calm Mode for ${name}`}
        >
          <Text>Turn off</Text>
        </Button>
      ) : null}

      {account.calm?.state === 'activating' ? (
        <View className="gap-2">
          <Button variant="outline" disabled aria-label={`Turn off Calm Mode for ${name}`}>
            <Text>Turn off</Text>
          </Button>
          <Text className="text-sm text-muted-foreground">
            {needsSignIn
              ? 'Bluesky needs you to sign in again before the rest of your posts can be hidden.'
              : 'You can turn Calm Mode off once hiding has finished.'}
          </Text>
        </View>
      ) : null}

      {needsSignIn ? (
        <Button variant="outline" onPress={onConnect} aria-label={`Sign in to ${name} again`}>
          <Text>Sign in again</Text>
        </Button>
      ) : null}

      {disconnect.data === 'has-hidden-posts' ? (
        <ErrorMessage>
          This account has hidden posts. Restore them, or delete them for good, before disconnecting
          it.
        </ErrorMessage>
      ) : null}
      {turnOff.error || disconnect.error ? (
        <ErrorMessage>Something went wrong. Please try again.</ErrorMessage>
      ) : null}
    </View>
  );
}
