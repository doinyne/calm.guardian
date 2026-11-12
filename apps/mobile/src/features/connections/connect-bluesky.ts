import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { apiClient } from '@/api/client';

/** Where our API sends people back after Bluesky. Must match the API's APP_CONNECT_RETURN_URL. */
const CONNECT_RETURN_PATH = 'connect/bluesky';

export type ConnectOutcome = 'connected' | 'cancelled' | 'connected-elsewhere' | 'failed';

type OpenAuthSession = (
  url: string,
  returnUrl: string,
) => Promise<WebBrowser.WebBrowserAuthSessionResult>;

const OUTCOME_BY_COMPLETE_STATUS: Partial<Record<number, ConnectOutcome>> = {
  201: 'connected',
  409: 'connected-elsewhere',
};

/**
 * Connects a Bluesky account (ADR-0003):
 * 1. Ask our API for Bluesky's sign-in page and open it in a secure sheet.
 * 2. Bluesky returns the user to the app with a single-use code.
 * 3. Hand that code back to our API, signed in, to finish connecting.
 *
 * The password is typed on Bluesky's own page; the app never sees it.
 */
export async function connectBluesky({
  openAuthSession = WebBrowser.openAuthSessionAsync,
  returnUrl = Linking.createURL(CONNECT_RETURN_PATH),
}: { openAuthSession?: OpenAuthSession; returnUrl?: string } = {}): Promise<ConnectOutcome> {
  // In Expo Go this is an exp:// link, in our own builds calmguardian://; the API checks it (ADR-0017).
  const start = await apiClient.connections.bluesky.$post({ json: { returnUrl } });
  if (!start.ok) return 'failed';
  const { authorizationUrl } = await start.json();

  const result = await openAuthSession(authorizationUrl, returnUrl);
  if (result.type !== 'success') return 'cancelled';

  const returned = new URL(result.url).searchParams;
  if (returned.get('status') === 'cancelled') return 'cancelled';
  const code = returned.get('code');
  if (!code) return 'failed';

  const complete = await apiClient.connections.bluesky.complete.$post({ json: { code } });
  return OUTCOME_BY_COMPLETE_STATUS[complete.status] ?? 'failed';
}
