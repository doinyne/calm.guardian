import { MAX_GUARDIANS, type CalmPeriod } from '@calm-guardian/shared';

import type { AccountId } from '../accounts/account-id';
import type { ReviewArchive } from '../calm/archive';
import type { createCalmMode, StartResult } from '../calm/calm-mode';
import type { CalmSessions } from '../calm/calm-session';
import type { ConnectedAccountId } from '../connections/connected-account';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { Guardianship, GuardianshipId, Guardianships } from './guardianship';

export type GuardiansDependencies = {
  guardianships: Guardianships;
  connectedAccounts: Pick<
    ConnectedAccountsRepository,
    'findById' | 'listForAccount' | 'setGuardiansCanTurnOn'
  >;
  archive: Pick<ReviewArchive, 'countToReviewFor'>;
  calmMode: Pick<ReturnType<typeof createCalmMode>, 'start'>;
  calmSessions: Pick<CalmSessions, 'findOpenFor'>;
  now: () => Date;
};

export type InviteResult =
  | { outcome: 'invited'; guardianship: Guardianship }
  | { outcome: 'already-invited'; guardianship: Guardianship }
  | { outcome: 'limit-reached' }
  | { outcome: 'yourself' };

/** Why a Guardian can or can't turn Calm Mode on for an account right now. */
export type CanTurnOn = 'yes' | 'already-on' | 'review-waiting' | 'needs-sign-in';

/** What a Guardian sees of someone they look after: never posts, never reasons (product rule 3). */
export type Protecting = {
  guardianshipId: GuardianshipId;
  accountEmail: string;
  connectedAccounts: {
    connectedAccountId: ConnectedAccountId;
    handle: string;
    calm: 'off' | 'turning-on' | 'on';
    canTurnOn: CanTurnOn;
  }[];
};

export type GuardianTurnOnResult =
  | StartResult
  /** Not their Guardian, or not allowed for this account. Deliberately one answer for both. */
  | { outcome: 'not-allowed' }
  /** Posts from the last time are still waiting in the user's Review (ADR-0011). */
  | { outcome: 'review-waiting' };

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Guardians (M6, ADR-0011): trusted contacts who can turn Calm Mode on for the accounts the user
 * allows, and nothing else. There is deliberately no way here for a Guardian to turn Calm Mode off,
 * see posts or Review, or change a setting: only the user can (product rules 3 and 6).
 */
export function createGuardians({
  guardianships,
  connectedAccounts,
  archive,
  calmMode,
  calmSessions,
  now,
}: GuardiansDependencies) {
  return {
    async invite({
      accountId,
      accountEmail,
      guardianEmail,
    }: {
      accountId: AccountId;
      accountEmail: string;
      guardianEmail: string;
    }): Promise<InviteResult> {
      const email = normalise(guardianEmail);
      if (email === normalise(accountEmail)) return { outcome: 'yourself' };

      const existing = await guardianships.listForAccount(accountId);
      const already = existing.find((guardianship) => guardianship.guardianEmail === email);
      if (already) return { outcome: 'already-invited', guardianship: already };
      if (existing.length >= MAX_GUARDIANS) return { outcome: 'limit-reached' };

      const guardianship = await guardianships.invite({
        accountId,
        accountEmail: normalise(accountEmail),
        guardianEmail: email,
        invitedAt: now(),
      });
      return { outcome: 'invited', guardianship };
    },

    listForAccount: (accountId: AccountId) => guardianships.listForAccount(accountId),

    remove: (input: { accountId: AccountId; guardianshipId: GuardianshipId }) =>
      guardianships.remove(input),

    setPermission: (input: {
      accountId: AccountId;
      connectedAccountId: ConnectedAccountId;
      allowed: boolean;
    }) => connectedAccounts.setGuardiansCanTurnOn(input),

    /** Invitations for whoever is signed in with this address. */
    invitationsFor: (guardianEmail: string) =>
      guardianships.listInvitationsFor(normalise(guardianEmail)),

    /**
     * Accepting needs a sign-in with the invited address: the emailed sign-in code proved they own
     * it, so a forwarded invitation is no use to anyone else (ADR-0011).
     */
    async accept({
      guardianAccountId,
      guardianEmail,
      guardianshipId,
    }: {
      guardianAccountId: AccountId;
      guardianEmail: string;
      guardianshipId: GuardianshipId;
    }): Promise<'accepted' | 'not-found'> {
      const guardianship = await guardianships.find(guardianshipId);
      if (!guardianship || guardianship.accountId === guardianAccountId) return 'not-found';
      const accepted = await guardianships.accept({
        guardianshipId,
        guardianEmail: normalise(guardianEmail),
        guardianAccountId,
        acceptedAt: now(),
      });
      return accepted ? 'accepted' : 'not-found';
    },

    /** From the link in a Guardian's email: no sign-in, the unguessable token is the proof. */
    optOutOfEmails: (optOutToken: string) =>
      guardianships.optOutOfEmails({ optOutToken, at: now() }),

    stepDown: (input: {
      guardianAccountId: AccountId;
      guardianEmail: string;
      guardianshipId: GuardianshipId;
    }) => guardianships.stepDown({ ...input, guardianEmail: normalise(input.guardianEmail) }),

    async protecting(guardianAccountId: AccountId): Promise<Protecting[]> {
      const result: Protecting[] = [];
      for (const guardianship of await guardianships.listForGuardian(guardianAccountId)) {
        const allowed = (await connectedAccounts.listForAccount(guardianship.accountId)).filter(
          (account) => account.guardiansCanTurnOn,
        );
        const accounts: Protecting['connectedAccounts'] = [];
        for (const account of allowed) {
          const open = await calmSessions.findOpenFor(account.id);
          const calm = !open ? 'off' : open.state === 'activating' ? 'turning-on' : 'on';
          accounts.push({
            connectedAccountId: account.id,
            handle: account.handle,
            calm,
            canTurnOn: await canTurnOn(account.id, account.status, calm),
          });
        }
        result.push({
          guardianshipId: guardianship.id,
          accountEmail: guardianship.accountEmail,
          connectedAccounts: accounts,
        });
      }
      return result;
    },

    /** A Guardian turns Calm Mode on. The caller queues the work, as for the user. */
    async turnOn({
      guardianAccountId,
      connectedAccountId,
      period,
    }: {
      guardianAccountId: AccountId;
      connectedAccountId: ConnectedAccountId;
      period: CalmPeriod;
    }): Promise<GuardianTurnOnResult> {
      const account = await connectedAccounts.findById(connectedAccountId);
      if (!account?.guardiansCanTurnOn) return { outcome: 'not-allowed' };
      const guardianship = (await guardianships.listForGuardian(guardianAccountId)).find(
        (candidate) => candidate.accountId === account.accountId,
      );
      if (!guardianship) return { outcome: 'not-allowed' };
      if ((await archive.countToReviewFor(account.id)) > 0) return { outcome: 'review-waiting' };

      return calmMode.start({
        accountId: account.accountId,
        connectedAccountId,
        period,
        startedBy: guardianship.id,
      });
    },
  };

  async function canTurnOn(
    connectedAccountId: ConnectedAccountId,
    status: string,
    calm: Protecting['connectedAccounts'][number]['calm'],
  ): Promise<CanTurnOn> {
    if (calm !== 'off') return 'already-on';
    if (status !== 'active') return 'needs-sign-in';
    if ((await archive.countToReviewFor(connectedAccountId)) > 0) return 'review-waiting';
    return 'yes';
  }
}
