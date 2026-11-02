import { useQuery } from '@tanstack/react-query';

import { apiClient } from './client';

export function useApiHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: async ({ signal }) => {
      const response = await apiClient.health.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Health check responded ${response.status}`);
      return response.json();
    },
    retry: false,
  });
}
