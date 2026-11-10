import { z } from 'zod';

import type { AccountId } from '../accounts/account-id';

export const PLATFORMS = ['bluesky'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** `needs_reauth`: the Platform stopped accepting our tokens, so the user must sign in again. */
export const CONNECTION_STATUSES = ['active', 'needs_reauth', 'revoked'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const ConnectedAccountIdSchema = z.uuid().brand<'ConnectedAccountId'>();
export type ConnectedAccountId = z.infer<typeof ConnectedAccountIdSchema>;

/** The account's permanent ID on its Platform (a DID for Bluesky). Handles change; this doesn't. */
export type ExternalAccountId = string & { readonly __brand: 'ExternalAccountId' };

/** A user's account on a Platform, linked to their Calm Guardian Account. */
export type ConnectedAccount = {
  id: ConnectedAccountId;
  accountId: AccountId;
  platform: Platform;
  externalId: ExternalAccountId;
  handle: string;
  status: ConnectionStatus;
  connectedAt: Date;
  /** The user lets their Guardians turn Calm Mode on for this account (ADR-0011). Off by default. */
  guardiansCanTurnOn: boolean;
};
