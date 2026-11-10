import type { AccountId } from '../accounts/account-id';

export type GuardianshipId = string & { readonly __brand: 'GuardianshipId' };

/**
 * A trusted contact the user asked to be their Guardian (ADR-0011).
 * - `invited`: asked, not yet accepted. The Guardian can do nothing yet, and gets no emails but the invitation.
 * - `active`: accepted while signed in with the invited address.
 */
export type Guardianship = {
  id: GuardianshipId;
  /** The user being looked after. */
  accountId: AccountId;
  accountEmail: string;
  guardianEmail: string;
  guardianAccountId: AccountId | null;
  state: 'invited' | 'active';
  emailsOptedOut: boolean;
  /** For the opt-out link in their emails. Unguessable; never shown in the app. */
  optOutToken: string;
};

/** Guardianships (the repository's port). */
export interface Guardianships {
  listForAccount(accountId: AccountId): Promise<Guardianship[]>;

  /** Invites, or returns the existing guardianship for that address. */
  invite(input: {
    accountId: AccountId;
    accountEmail: string;
    guardianEmail: string;
    invitedAt: Date;
  }): Promise<Guardianship>;

  /** Invitations waiting for whoever signs in with this address. */
  listInvitationsFor(guardianEmail: string): Promise<Guardianship[]>;

  /** Only an invitation sent to `guardianEmail`. Returns whether it was accepted. */
  accept(input: {
    guardianshipId: GuardianshipId;
    guardianEmail: string;
    guardianAccountId: AccountId;
    acceptedAt: Date;
  }): Promise<boolean>;

  /** The guardianships a Guardian has accepted. */
  listForGuardian(guardianAccountId: AccountId): Promise<Guardianship[]>;

  /** The user removes a Guardian, invited or active. */
  remove(input: { accountId: AccountId; guardianshipId: GuardianshipId }): Promise<void>;

  /** The Guardian steps down, or declines an invitation sent to their address. */
  stepDown(input: {
    guardianshipId: GuardianshipId;
    guardianAccountId: AccountId;
    guardianEmail: string;
  }): Promise<void>;

  find(guardianshipId: GuardianshipId): Promise<Guardianship | undefined>;

  /** The Guardian stops Calm Guardian's emails. Returns false for an unknown token. */
  optOutOfEmails(input: { optOutToken: string; at: Date }): Promise<boolean>;
}
