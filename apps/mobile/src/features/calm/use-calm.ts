import type { CalmPeriodPreset } from '@calm-guardian/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

const CALM_QUERY_KEY = ['calm'] as const;
const CONNECTIONS_QUERY_KEY = ['connections'] as const;

/** How often to refresh while posts are being hidden, so progress moves on screen. */
const PROGRESS_REFRESH_MS = 3_000;
/** While Calm Mode is on, so posts the Sweep hides show up in the count. */
const CALM_REFRESH_MS = 30_000;

/** Who Calm Mode is being turned on for: one connected account, or all of them. */
export type CalmTarget = { connectedAccountId: string } | 'all';

/** Each connected account with its Calm Mode, as the server sees it (product rule 5). */
export function useCalmStatus() {
  return useQuery({
    queryKey: CALM_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.calm.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Calm status responded ${response.status}`);
      return (await response.json()).connectedAccounts;
    },
    refetchInterval: (query) => {
      const accounts = query.state.data ?? [];
      if (accounts.some((account) => account.calm?.state === 'activating')) {
        return PROGRESS_REFRESH_MS;
      }
      return accounts.some((account) => account.calm?.state === 'active') ? CALM_REFRESH_MS : false;
    },
  });
}

export type CalmAccount = NonNullable<ReturnType<typeof useCalmStatus>['data']>[number];

/** Roughly how many posts turning Calm Mode on would hide. For "all", the accounts' counts added up. */
export function useCalmPreview(
  target: CalmTarget,
  connectedAccountIds: readonly string[],
  period: CalmPeriodPreset,
) {
  const ids = target === 'all' ? connectedAccountIds : [target.connectedAccountId];
  return useQuery({
    queryKey: ['calm-preview', ids, period],
    enabled: ids.length > 0,
    queryFn: async () => {
      let posts = 0;
      let more = false;
      for (const id of ids) {
        const response = await apiClient.connections[':id'].calm.preview.$post({
          param: { id },
          json: { period },
        });
        if (!response.ok) throw new Error(`Preview responded ${response.status}`);
        const preview = await response.json();
        posts += preview.posts;
        more ||= preview.more;
      }
      return { posts, more };
    },
  });
}

export type TurnOnOutcome = 'started' | 'needs-sign-in';

export function useTurnOnCalm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      target,
      period,
    }: {
      target: CalmTarget;
      period: CalmPeriodPreset;
    }): Promise<TurnOnOutcome> => {
      const response =
        target === 'all'
          ? await apiClient.calm.$post({ json: { period } })
          : await apiClient.connections[':id'].calm.$post({
              param: { id: target.connectedAccountId },
              json: { period },
            });
      if (response.status === 409) return 'needs-sign-in';
      if (!response.ok) throw new Error(`Turning on responded ${response.status}`);
      return 'started';
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CALM_QUERY_KEY }),
  });
}

export type TurnOffOutcome = 'off' | 'still-hiding';

export function useTurnOffCalm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectedAccountId: string): Promise<TurnOffOutcome> => {
      const response = await apiClient.connections[':id'].calm.$delete({
        param: { id: connectedAccountId },
      });
      if (response.status === 409) return 'still-hiding';
      if (!response.ok) throw new Error(`Turning off responded ${response.status}`);
      return 'off';
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CALM_QUERY_KEY }),
  });
}

export type DisconnectOutcome = 'disconnected' | 'has-hidden-posts';

export function useDisconnectAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectedAccountId: string): Promise<DisconnectOutcome> => {
      const response = await apiClient.connections[':id'].$delete({
        param: { id: connectedAccountId },
      });
      if (response.status === 409) return 'has-hidden-posts';
      if (!response.ok) throw new Error(`Disconnect responded ${response.status}`);
      return 'disconnected';
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: CALM_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
    },
  });
}
