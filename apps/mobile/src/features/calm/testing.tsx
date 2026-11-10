import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { CalmAccount } from './use-calm';

type CalmSessionReadout = NonNullable<CalmAccount['calm']>;

/**
 * A connected account as `GET /calm` returns it. IDs arrive as plain JSON strings; the API's branded
 * ID types only exist on the server, so the casts here are about types, not data.
 */
export function aCalmAccount(
  overrides: Partial<Omit<CalmAccount, 'id'>> & { id?: string } = {},
): CalmAccount {
  return {
    platform: 'bluesky',
    handle: 'doinyne.bsky.social',
    status: 'active',
    calm: null,
    guardiansCanTurnOn: false,
    ...overrides,
    id: (overrides.id ?? '6f1c2a4e-0b7d-4c1e-9a3f-2d5e8b7c6a10') as CalmAccount['id'],
  };
}

export const calmSession = (
  state: 'activating' | 'active',
  hidden: number,
): CalmSessionReadout => ({
  calmSessionId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' as CalmSessionReadout['calmSessionId'],
  state,
  period: { from: '2026-10-28T12:00:00.000Z', to: '2026-11-04T12:00:00.000Z' },
  startedAt: '2026-11-04T12:00:00.000Z',
  hidden,
  startedByGuardian: null,
});

type Reply = { status?: number; body?: unknown };
/** A fixed reply, or a function for one that changes as the test goes on. */
type Route = Reply | (() => Reply);

/**
 * Our API, stubbed at the network edge. `routes` maps "METHOD /path" to a reply; `GET /calm` returns
 * the accounts. Returns every request made, as "METHOD /path".
 */
export function stubApi({
  accounts,
  routes = {},
}: {
  accounts: () => CalmAccount[];
  routes?: Record<string, Route>;
}) {
  const requests: { method: string; path: string; body?: unknown }[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path: url.pathname, body });

    const route = routes[`${method} ${url.pathname}`];
    const reply = typeof route === 'function' ? route() : route;
    if (reply) {
      return reply.body === undefined
        ? new Response(null, { status: reply.status ?? 204 })
        : Response.json(reply.body, { status: reply.status ?? 200 });
    }
    if (method === 'GET' && url.pathname === '/calm') {
      return Response.json({ connectedAccounts: accounts() });
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return requests;
}

export async function renderWithQueries(ui: ReactElement) {
  // No retries, and no garbage-collection timers left running to keep Jest from exiting.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  await render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
