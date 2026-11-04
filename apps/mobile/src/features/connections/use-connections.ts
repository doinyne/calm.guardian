import { useMutation, useQueryClient } from '@tanstack/react-query';

import { connectBluesky } from './connect-bluesky';

const CONNECTIONS_QUERY_KEY = ['connections'] as const;

export function useConnectBluesky() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => connectBluesky(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: CONNECTIONS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['calm'] });
    },
  });
}
