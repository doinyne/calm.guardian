import { View } from 'react-native';

import { ErrorMessage } from '@/components/error-message';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { useConnections, useDisconnect } from './use-connections';

type ConnectionStatus = 'active' | 'needs_reauth' | 'revoked';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  active: 'Connected',
  needs_reauth: 'Sign in again',
  revoked: 'Disconnected',
};

/** The user's connected accounts, with Disconnect, and a way into connecting another. */
export function ConnectedAccountsPanel({ onConnectPress }: { onConnectPress: () => void }) {
  const connections = useConnections();
  const disconnect = useDisconnect();

  // Several accounts can be connected, even on one Platform. Once one is, connecting more is a
  // quieter, secondary action.
  const hasConnections = (connections.data?.length ?? 0) > 0;

  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-5">
      <View role="heading">
        <MonoLabel>Connected accounts</MonoLabel>
      </View>

      {connections.isPending ? <Text className="text-muted-foreground">Loading…</Text> : null}
      {connections.isError ? (
        <ErrorMessage>We couldn&apos;t load your accounts. Please try again.</ErrorMessage>
      ) : null}
      {connections.data?.length === 0 ? (
        <Text className="text-muted-foreground">No accounts connected yet.</Text>
      ) : null}

      {connections.data?.map((account) => (
        <View key={account.id} className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Text>@{account.handle}</Text>
            <MonoLabel tone={account.status === 'active' ? 'primary' : 'muted'}>
              {`Bluesky · ${STATUS_LABEL[account.status]}`}
            </MonoLabel>
          </View>
          <Button
            variant="ghost"
            onPress={() => disconnect.mutate(account.id)}
            disabled={disconnect.isPending}
            aria-label={`Disconnect @${account.handle}`}
          >
            <Text>Disconnect</Text>
          </Button>
        </View>
      ))}
      {disconnect.error ? (
        <ErrorMessage>We couldn&apos;t disconnect that account. Please try again.</ErrorMessage>
      ) : null}

      <Button size="lg" variant={hasConnections ? 'outline' : 'default'} onPress={onConnectPress}>
        <Text>{hasConnections ? 'Connect another account' : 'Connect an account'}</Text>
      </Button>
    </View>
  );
}
