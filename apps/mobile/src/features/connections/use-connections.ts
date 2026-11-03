import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

import { connectBluesky } from './connect-bluesky';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;

/** The signed-in user's connected accounts. */
export function useConnections() {
  return useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.connections.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Connections responded ${response.status}`);
      return (await response.json()).connectedAccounts;
    },
  });
}

export function useConnectBluesky() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => connectBluesky(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY }),
  });
}

export function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectedAccountId: string) => {
      const response = await apiClient.connections[':id'].$delete({
        param: { id: connectedAccountId },
      });
      if (!response.ok) throw new Error(`Disconnect responded ${response.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY }),
  });
}
