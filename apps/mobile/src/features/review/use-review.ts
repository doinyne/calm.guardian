import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

const REVIEW_QUERY_KEY = ['review'] as const;
const CALM_QUERY_KEY = ['calm'] as const;

/** The user's hidden posts: still to review first, then kept hidden. */
export function useReview() {
  return useQuery({
    queryKey: REVIEW_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const response = await apiClient.review.$get(undefined, { init: { signal } });
      if (!response.ok) throw new Error(`Review responded ${response.status}`);
      return response.json();
    },
  });
}

export type ReviewPost = NonNullable<ReturnType<typeof useReview>['data']>['posts'][number];

/** Why an action couldn't happen, in words the screen can show. */
export type ReviewProblem = 'calm-mode-on' | 'needs-sign-in' | 'busy';

const PROBLEM_BY_CODE: Record<string, ReviewProblem> = {
  calm_mode_on: 'calm-mode-on',
  connection_needs_sign_in: 'needs-sign-in',
  platform_busy: 'busy',
};

/** The little of a response this needs, so it fits every typed route's response. */
type ActionResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

async function problemIn(response: ActionResponse): Promise<ReviewProblem | null> {
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  const problem = PROBLEM_BY_CODE[body?.error?.code ?? ''];
  if (!problem) throw new Error(`Review action responded ${response.status}`);
  return problem;
}

/** Every Review action refreshes Review and Calm Mode's status, whatever happened. */
function useReviewAction<Input>(send: (input: Input) => Promise<ActionResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) => problemIn(await send(input)),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: REVIEW_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: CALM_QUERY_KEY });
    },
  });
}

export const useRestorePost = () =>
  useReviewAction((id: string) => apiClient.review[':id'].restore.$post({ param: { id } }));

export const useKeepHidden = () =>
  useReviewAction((id: string) => apiClient.review[':id']['keep-hidden'].$post({ param: { id } }));

export const useDeleteForGood = () =>
  useReviewAction((id: string) => apiClient.review[':id'].$delete({ param: { id } }));

export const useRestoreAll = () =>
  useReviewAction((connectedAccountId: string) =>
    apiClient.connections[':id']['restore-all'].$post({ param: { id: connectedAccountId } }),
  );
