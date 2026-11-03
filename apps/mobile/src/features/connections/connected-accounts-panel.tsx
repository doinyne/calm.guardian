import { View } from 'react-native';

import { ErrorMessage } from '@/components/error-message';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import type { ConnectOutcome } from './connect-bluesky';
import { useConnectBluesky, useConnections, useDisconnect } from './use-connections';

type ConnectionStatus = 'active' | 'needs_reauth' | 'revoked';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  active: 'Connected',
  needs_reauth: 'Sign in again',
  revoked: 'Disconnected',
};

/** What to say after a connect attempt. Nothing for success: the account appears in the list. */
const OUTCOME_MESSAGE: Record<ConnectOutcome, { text: string; isProblem: boolean } | null> = {
  connected: null,
  cancelled: {
    text: 'No account was connected. You can try again whenever you like.',
    isProblem: false,
  },
  'connected-elsewhere': {
    text: 'That Bluesky account is already connected to another Calm Guardian account.',
    isProblem: true,
  },
  failed: { text: "We couldn't connect your Bluesky account. Please try again.", isProblem: true },
};

/** The user's connected accounts, with Connect and Disconnect. Slice 3 gives this its real design. */
export function ConnectedAccountsPanel() {
  const connections = useConnections();
  const connect = useConnectBluesky();
  const disconnect = useDisconnect();

  const outcome = connect.error
    ? OUTCOME_MESSAGE.failed
    : connect.data && OUTCOME_MESSAGE[connect.data];
  // Several accounts can be connected, even on one Platform. Once one is, connecting more is a
  // quieter, secondary action.
  const hasConnections = (connections.data?.length ?? 0) > 0;
  const connectLabel = hasConnections ? 'Connect another account' : 'Connect Bluesky';

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

      <Button
        size="lg"
        variant={hasConnections ? 'outline' : 'default'}
        onPress={() => connect.mutate()}
        disabled={connect.isPending}
      >
        <Text>{connect.isPending ? 'Connecting…' : connectLabel}</Text>
      </Button>
      {outcome?.isProblem ? <ErrorMessage>{outcome.text}</ErrorMessage> : null}
      {outcome && !outcome.isProblem ? (
        <Text className="text-muted-foreground">{outcome.text}</Text>
      ) : null}
    </View>
  );
}
