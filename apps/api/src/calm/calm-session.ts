import type { CalmPeriod } from '@calm-guardian/shared';

import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccountId } from '../connections/connected-account';

export type CalmSessionId = string & { readonly __brand: 'CalmSessionId' };

/**
 * - `activating`: backing up and hiding posts. An interrupted activation resumes from here.
 * - `active`: Calm Mode is on for the connected account.
 * - `failed`: activation stopped before hiding anything. Calm Mode is off.
 *
 * Turning Calm Mode off (`ending`, `ended`) arrives with M3.
 */
export const CALM_SESSION_STATES = ['activating', 'active', 'failed'] as const;
export type CalmSessionState = (typeof CALM_SESSION_STATES)[number];

/** Where each state can go next. `active` and `failed` wait for deactivation (M3). */
const NEXT_STATES: Record<CalmSessionState, readonly CalmSessionState[]> = {
  activating: ['active', 'failed'],
  active: [],
  failed: [],
};

export function canMoveTo(from: CalmSessionState, to: CalmSessionState): boolean {
  return NEXT_STATES[from].includes(to);
}

/** A session that holds Calm Mode for its connected account. At most one per connected account. */
export function isOpen(state: CalmSessionState): boolean {
  return state === 'activating' || state === 'active';
}

export type CalmSessionFailure = 'could-not-read-posts' | 'backup-failed';

/** One activation-to-deactivation period for one connected account (ADR-0011). */
export type CalmSession = {
  id: CalmSessionId;
  connectedAccountId: ConnectedAccountId;
  state: CalmSessionState;
  period: CalmPeriod;
  startedAt: Date;
};

/** Calm sessions (the repository's port). */
export interface CalmSessions {
  /**
   * The connected account's open session, or a new `activating` one when it has none. Atomic: two
   * calls at once never open two sessions for one connected account.
   */
  openFor(input: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
    period: CalmPeriod;
    startedAt: Date;
  }): Promise<CalmSession>;

  markActive(input: { calmSessionId: CalmSessionId; activatedAt: Date }): Promise<void>;

  markFailed(input: {
    calmSessionId: CalmSessionId;
    reason: CalmSessionFailure;
    failedAt: Date;
  }): Promise<void>;
}
