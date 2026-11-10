import type { CalmSessionId, CalmSessions } from '../calm/calm-session';
import type { ConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import type { EmailSender } from '../email/email-sender';
import { guardianEmails } from '../email/guardian-emails';
import type { Guardianship, Guardianships } from './guardianship';

export type GuardianNoticesDependencies = {
  guardianships: Pick<Guardianships, 'listForAccount'>;
  connectedAccounts: Pick<ConnectedAccountsRepository, 'findById'>;
  calmSessions: Pick<CalmSessions, 'find' | 'claimNotice' | 'releaseNotice'>;
  email: EmailSender;
  /** Where links in emails point, e.g. the opt-out link. */
  publicApiUrl: URL;
};

/**
 * The emails around Guardians (M6). "Calm Mode is on" goes out only once activation has succeeded,
 * and only once per Calm session (BUILD_PLAN M6).
 */
export function createGuardianNotices({
  guardianships,
  connectedAccounts,
  calmSessions,
  email,
  publicApiUrl,
}: GuardianNoticesDependencies) {
  const optOutUrl = (guardianship: Guardianship) => {
    const url = new URL('/guardian/emails/opt-out', publicApiUrl);
    url.searchParams.set('token', guardianship.optOutToken);
    return url.href;
  };

  return {
    invited: (guardianship: Guardianship) =>
      email.send(
        guardianEmails.invitation({
          to: guardianship.guardianEmail,
          from: guardianship.accountEmail,
        }),
      ),

    /** Call once Calm Mode is fully on. Safe to call again: it sends at most once per session. */
    async calmModeOn(calmSessionId: CalmSessionId) {
      const calmSession = await calmSessions.find(calmSessionId);
      if (calmSession?.state !== 'active') return;
      const account = await connectedAccounts.findById(calmSession.connectedAccountId);
      if (!account) return;
      if (!(await calmSessions.claimNotice(calmSessionId))) return;

      try {
        const all = await guardianships.listForAccount(calmSession.accountId);
        for (const guardianship of all) {
          if (guardianship.state !== 'active' || guardianship.emailsOptedOut) continue;
          await email.send(
            guardianEmails.calmModeOnForGuardian({
              to: guardianship.guardianEmail,
              accountEmail: guardianship.accountEmail,
              handle: account.handle,
              optOutUrl: optOutUrl(guardianship),
            }),
          );
        }

        const byGuardian = all.find((guardianship) => guardianship.id === calmSession.startedBy);
        if (byGuardian) {
          await email.send(
            guardianEmails.turnedOnByGuardian({
              to: byGuardian.accountEmail,
              guardian: byGuardian.guardianEmail,
              handle: account.handle,
            }),
          );
        }
      } catch (error) {
        // Give the claim back, so the job's retry sends them. Someone may get one twice; nobody misses one.
        await calmSessions.releaseNotice(calmSessionId);
        throw error;
      }
    },
  };
}
