import type { CalmPeriodPreset } from '@calm-guardian/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

const GUARDIANS_KEY = ['guardians'] as const;
const CALM_KEY = ['calm'] as const;
const INVITATIONS_KEY = ['guardian-invitations'] as const;
const PROTECTING_KEY = ['guardian-protecting'] as const;

// The user and their Guardians

export function useGuardians() {
  return useQuery({
    queryKey: GUARDIANS_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.guardians.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Guardians responded ${response.status}`);
      return response.json();
    },
  });
}

export type InviteOutcome = 'invited' | 'limit-reached' | 'yourself';

export function useInviteGuardian() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string): Promise<InviteOutcome> => {
      const response = await apiClient.guardians.$post({ json: { email } });
      if (response.ok) return 'invited';
      const body = (await response.json()) as { error?: { code?: string } };
      if (body.error?.code === 'guardian_limit_reached') return 'limit-reached';
      if (body.error?.code === 'guardian_is_you') return 'yourself';
      throw new Error(`Inviting responded ${response.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: GUARDIANS_KEY }),
  });
}

export function useRemoveGuardian() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.guardians[':id'].$delete({ param: { id } });
      if (!response.ok) throw new Error(`Removing responded ${response.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: GUARDIANS_KEY }),
  });
}

export function useSetGuardiansCanTurnOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      connectedAccountId,
      allowed,
    }: {
      connectedAccountId: string;
      allowed: boolean;
    }) => {
      const response = await apiClient.connections[':id']['guardians-can-turn-on'].$put({
        param: { id: connectedAccountId },
        json: { allowed },
      });
      if (!response.ok) throw new Error(`Permission responded ${response.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CALM_KEY }),
  });
}

// Acting as someone's Guardian

export function useGuardianInvitations() {
  return useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.guardian.invitations.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Invitations responded ${response.status}`);
      return (await response.json()).invitations;
    },
  });
}

export function useProtecting() {
  return useQuery({
    queryKey: PROTECTING_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.guardian.protecting.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Protecting responded ${response.status}`);
      return (await response.json()).protecting;
    },
  });
}

export type Protected = NonNullable<ReturnType<typeof useProtecting>['data']>[number];

function useGuardianAction<Input>(
  send: (input: Input) => Promise<{ ok: boolean; status: number }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) => {
      const response = await send(input);
      if (!response.ok) throw new Error(`Guardian action responded ${response.status}`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: PROTECTING_KEY });
    },
  });
}

export const useAcceptInvitation = () =>
  useGuardianAction((id: string) =>
    apiClient.guardian.invitations[':id'].accept.$post({ param: { id } }),
  );

/** Declining an invitation, or stepping down later. */
export const useStepDown = () =>
  useGuardianAction((id: string) =>
    apiClient.guardian.guardianships[':id'].$delete({ param: { id } }),
  );

export const useGuardianTurnOn = () =>
  useGuardianAction(
    ({ connectedAccountId, period }: { connectedAccountId: string; period: CalmPeriodPreset }) =>
      apiClient.guardian.connections[':id'].calm.$post({
        param: { id: connectedAccountId },
        json: { period },
      }),
  );
