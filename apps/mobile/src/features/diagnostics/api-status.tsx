import { View } from 'react-native';

import { useApiHealth } from '@/api/use-api-health';
import { Text } from '@/components/ui/text';
import { publicEnv } from '@/config/env';
import { cn } from '@/lib/utils';

export type ApiConnectionState = 'checking' | 'connected' | 'unreachable';

const LABEL: Record<ApiConnectionState, string> = {
  checking: 'Checking…',
  connected: 'Connected',
  unreachable: 'Unreachable',
};

const INDICATOR_CLASS: Record<ApiConnectionState, string> = {
  checking: 'bg-muted-foreground',
  connected: 'bg-primary',
  unreachable: 'bg-destructive',
};

const STATE_BY_QUERY_STATUS = {
  pending: 'checking',
  success: 'connected',
  error: 'unreachable',
} as const satisfies Record<string, ApiConnectionState>;

/** Shows testers which API this build talks to and whether it can reach it. */
export function ApiStatus() {
  const { status } = useApiHealth();

  return <ApiStatusView state={STATE_BY_QUERY_STATUS[status]} apiUrl={publicEnv.apiUrl} />;
}

export function ApiStatusView({ state, apiUrl }: { state: ApiConnectionState; apiUrl: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`API ${LABEL[state]}. ${apiUrl}`}
      className="flex-row items-center gap-2 rounded-lg bg-muted px-4 py-3"
    >
      <View className={cn('size-2 rounded-full', INDICATOR_CLASS[state])} />
      <Text variant="small">API: {LABEL[state]}</Text>
      <Text variant="muted" numberOfLines={1} className="flex-1 text-right">
        {apiUrl}
      </Text>
    </View>
  );
}
