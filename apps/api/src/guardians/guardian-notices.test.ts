import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import { createCalmMode } from '../calm/calm-mode';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { FakeGuardianships } from '../testing/fake-guardianships';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { captureLogs } from '../testing/log-capture';
import { createGuardianNotices } from './guardian-notices';
import { createGuardians } from './guardians';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const USER = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;
const ALEX = '9d4e1f60-7a2b-4c8d-8e3f-1a2b3c4d5e6f' as AccountId;
const SAM = '5c6d7e8f-1a2b-4c3d-9e8f-0a1b2c3d4e5f' as AccountId;

async function setUp() {
  const connectedAccounts = new FakeConnectedAccounts();
  const calmSessions = new FakeCalmSessions();
  const guardianships = new FakeGuardianships();
  const platform = new FakePlatformPosts();
  const email = new FakeEmailSender();
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive: new FakeArchive(),
    calmSessions,
    now: () => NOW,
    logger: captureLogs().logger,
  });
  const guardians = createGuardians({
    guardianships,
    connectedAccounts,
    archive: new FakeArchive(),
    calmMode,
    calmSessions,
    now: () => NOW,
  });
  const notices = createGuardianNotices({
    guardianships,
    connectedAccounts,
    calmSessions,
    email,
    publicApiUrl: new URL('http://localhost:3000'),
  });
  const account = await connectedAccounts.connect({
    accountId: USER,
    platform: 'bluesky',
    externalId: 'did:plc:dean' as ExternalAccountId,
    handle: 'dean.bsky.social',
  });
  await connectedAccounts.setGuardiansCanTurnOn({
    accountId: USER,
    connectedAccountId: account.id,
    allowed: true,
  });
  platform.publish(account.id, aPost('2026-11-10T09:00:00.000Z'));

  async function guardian(id: AccountId, address: string) {
    const invited = await guardians.invite({
      accountId: USER,
      accountEmail: 'dean@example.com',
      guardianEmail: address,
    });
    if (invited.outcome !== 'invited') throw new Error('expected an invitation');
    await guardians.accept({
      guardianAccountId: id,
      guardianEmail: address,
      guardianshipId: invited.guardianship.id,
    });
    return invited.guardianship;
  }

  return { notices, guardians, calmMode, email, guardianships, account, guardian };
}

describe('the invitation email', () => {
  it('goes to the invited address, from the user', async () => {
    const { notices, guardians, email } = await setUp();
    const invited = await guardians.invite({
      accountId: USER,
      accountEmail: 'dean@example.com',
      guardianEmail: 'alex@example.com',
    });
    if (invited.outcome !== 'invited') throw new Error('expected an invitation');

    await notices.invited(invited.guardianship);

    expect(email.sent).toMatchObject([
      { to: 'alex@example.com', subject: 'dean@example.com asked you to be their Guardian' },
    ]);
  });
});

describe('"Calm Mode is on" emails', () => {
  it('tell every Guardian, with their own opt-out link, but nothing about the posts', async () => {
    const { notices, calmMode, email, account, guardian } = await setUp();
    const alex = await guardian(ALEX, 'alex@example.com');
    await guardian(SAM, 'sam@example.com');
    const result = await calmMode.activate({
      accountId: USER,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });
    if (result.outcome !== 'active') throw new Error('expected Calm Mode on');

    await notices.calmModeOn(result.calmSessionId);

    expect(email.sent.map((message) => message.to).sort()).toEqual([
      'alex@example.com',
      'sam@example.com',
    ]);
    const toAlex = email.sent.find((message) => message.to === 'alex@example.com');
    expect(toAlex?.text).toContain(`opt-out?token=${alex.optOutToken}`);
    expect(toAlex?.text).not.toMatch(/Post \d+/);
  });

  it('are sent once, however often the job runs', async () => {
    const { notices, calmMode, email, account, guardian } = await setUp();
    await guardian(ALEX, 'alex@example.com');
    const result = await calmMode.activate({
      accountId: USER,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });
    if (result.outcome !== 'active') throw new Error('expected Calm Mode on');

    await notices.calmModeOn(result.calmSessionId);
    await notices.calmModeOn(result.calmSessionId);

    expect(email.sent).toHaveLength(1);
  });

  it('are sent on the next try if sending failed', async () => {
    const { notices, calmMode, email, account, guardian } = await setUp();
    await guardian(ALEX, 'alex@example.com');
    const result = await calmMode.activate({
      accountId: USER,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });
    if (result.outcome !== 'active') throw new Error('expected Calm Mode on');
    email.failOnce();

    await expect(notices.calmModeOn(result.calmSessionId)).rejects.toThrow();
    await notices.calmModeOn(result.calmSessionId);

    expect(email.sent).toHaveLength(1);
  });

  it('skip a Guardian who opted out', async () => {
    const { notices, calmMode, email, account, guardian, guardianships } = await setUp();
    const alex = await guardian(ALEX, 'alex@example.com');
    await guardianships.optOutOfEmails({ optOutToken: alex.optOutToken, at: NOW });
    const result = await calmMode.activate({
      accountId: USER,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });
    if (result.outcome !== 'active') throw new Error('expected Calm Mode on');

    await notices.calmModeOn(result.calmSessionId);

    expect(email.sent).toEqual([]);
  });

  it('tell the user straight away when a Guardian turned it on', async () => {
    const { notices, guardians, calmMode, email, account, guardian } = await setUp();
    await guardian(ALEX, 'alex@example.com');
    const started = await guardians.turnOn({
      guardianAccountId: ALEX,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });
    if (started.outcome !== 'started') throw new Error('expected a start');
    await calmMode.continueActivation({ calmSessionId: started.calmSessionId });

    await notices.calmModeOn(started.calmSessionId);

    expect(email.sent.find((message) => message.to === 'dean@example.com')).toMatchObject({
      subject: 'alex@example.com turned on Calm Mode for @dean.bsky.social',
    });
  });
});
