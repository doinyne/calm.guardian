import { MAX_GUARDIANS, presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import { createCalmMode } from '../calm/calm-mode';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { FakeGuardianships } from '../testing/fake-guardianships';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { captureLogs } from '../testing/log-capture';
import { createGuardians } from './guardians';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const PERIOD = presetCalmPeriod('last-24-hours', NOW);
const USER = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;
const USER_EMAIL = 'dean@example.com';
const GUARDIAN = '9d4e1f60-7a2b-4c8d-8e3f-1a2b3c4d5e6f' as AccountId;
const GUARDIAN_EMAIL = 'alex@example.com';
const STRANGER = '5c6d7e8f-1a2b-4c3d-9e8f-0a1b2c3d4e5f' as AccountId;

/** A user with one Bluesky account, Guardians wired to the real Calm Mode core over fakes. */
async function setUp() {
  const connectedAccounts = new FakeConnectedAccounts();
  const archive = new FakeArchive();
  const calmSessions = new FakeCalmSessions();
  const platform = new FakePlatformPosts();
  const guardianships = new FakeGuardianships();
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive,
    calmSessions,
    now: () => NOW,
    logger: captureLogs().logger,
  });
  const guardians = createGuardians({
    guardianships,
    connectedAccounts,
    archive,
    calmMode,
    calmSessions,
    now: () => NOW,
  });
  const account = await connectedAccounts.connect({
    accountId: USER,
    platform: 'bluesky',
    externalId: 'did:plc:dean' as ExternalAccountId,
    handle: 'dean.bsky.social',
  });

  /** Alex invited, accepted, and allowed to turn Calm Mode on for the account. */
  async function trustedGuardian() {
    const invited = await guardians.invite({
      accountId: USER,
      accountEmail: USER_EMAIL,
      guardianEmail: GUARDIAN_EMAIL,
    });
    if (invited.outcome !== 'invited') throw new Error('expected an invitation');
    await guardians.accept({
      guardianAccountId: GUARDIAN,
      guardianEmail: GUARDIAN_EMAIL,
      guardianshipId: invited.guardianship.id,
    });
    await guardians.setPermission({
      accountId: USER,
      connectedAccountId: account.id,
      allowed: true,
    });
    return invited.guardianship;
  }

  return {
    guardians,
    guardianships,
    calmMode,
    calmSessions,
    platform,
    archive,
    account,
    connectedAccounts,
    trustedGuardian,
  };
}

describe('inviting Guardians', () => {
  it('invites by email address, ignoring case', async () => {
    const { guardians } = await setUp();

    const result = await guardians.invite({
      accountId: USER,
      accountEmail: USER_EMAIL,
      guardianEmail: ' Alex@Example.com ',
    });

    expect(result).toMatchObject({
      outcome: 'invited',
      guardianship: { guardianEmail: GUARDIAN_EMAIL, state: 'invited' },
    });
  });

  it('is safe to repeat', async () => {
    const { guardians, guardianships } = await setUp();
    const invite = () =>
      guardians.invite({
        accountId: USER,
        accountEmail: USER_EMAIL,
        guardianEmail: GUARDIAN_EMAIL,
      });

    await invite();
    const again = await invite();

    expect(again.outcome).toBe('already-invited');
    expect(guardianships.all()).toHaveLength(1);
  });

  it(`allows at most ${MAX_GUARDIANS} Guardians`, async () => {
    const { guardians } = await setUp();
    for (let index = 0; index < MAX_GUARDIANS; index += 1) {
      await guardians.invite({
        accountId: USER,
        accountEmail: USER_EMAIL,
        guardianEmail: `guardian${index}@example.com`,
      });
    }

    const one_more = await guardians.invite({
      accountId: USER,
      accountEmail: USER_EMAIL,
      guardianEmail: 'one-more@example.com',
    });

    expect(one_more).toEqual({ outcome: 'limit-reached' });
  });

  it("can't make you your own Guardian", async () => {
    const { guardians } = await setUp();

    expect(
      await guardians.invite({
        accountId: USER,
        accountEmail: USER_EMAIL,
        guardianEmail: 'DEAN@example.com',
      }),
    ).toEqual({ outcome: 'yourself' });
  });
});

describe('accepting', () => {
  it('is only possible signed in with the address the invitation went to', async () => {
    const { guardians } = await setUp();
    const invited = await guardians.invite({
      accountId: USER,
      accountEmail: USER_EMAIL,
      guardianEmail: GUARDIAN_EMAIL,
    });
    if (invited.outcome !== 'invited') throw new Error('expected an invitation');

    const someoneElse = await guardians.accept({
      guardianAccountId: STRANGER,
      guardianEmail: 'stranger@example.com',
      guardianshipId: invited.guardianship.id,
    });
    const alex = await guardians.accept({
      guardianAccountId: GUARDIAN,
      guardianEmail: GUARDIAN_EMAIL,
      guardianshipId: invited.guardianship.id,
    });

    expect([someoneElse, alex]).toEqual(['not-found', 'accepted']);
  });

  it('shows a Guardian the invitations waiting for their address', async () => {
    const { guardians } = await setUp();
    await guardians.invite({
      accountId: USER,
      accountEmail: USER_EMAIL,
      guardianEmail: GUARDIAN_EMAIL,
    });

    expect(await guardians.invitationsFor(GUARDIAN_EMAIL)).toMatchObject([
      { accountEmail: USER_EMAIL },
    ]);
  });
});

describe('what a Guardian can see', () => {
  it('only the accounts they may protect: handle and whether Calm Mode is on, nothing more', async () => {
    const { guardians, trustedGuardian, connectedAccounts, account } = await setUp();
    await trustedGuardian();
    await connectedAccounts.connect({
      accountId: USER,
      platform: 'bluesky',
      externalId: 'did:plc:private' as ExternalAccountId,
      handle: 'private.bsky.social',
    });

    const protecting = await guardians.protecting(GUARDIAN);

    expect(protecting).toEqual([
      {
        guardianshipId: expect.any(String) as string,
        accountEmail: USER_EMAIL,
        connectedAccounts: [
          {
            connectedAccountId: account.id,
            handle: 'dean.bsky.social',
            calm: 'off',
            canTurnOn: 'yes',
          },
        ],
      },
    ]);
  });
});

describe('a Guardian turning Calm Mode on', () => {
  it('starts it for an allowed account, recorded as theirs, through the same safe core', async () => {
    const { guardians, trustedGuardian, account, calmSessions } = await setUp();
    const guardianship = await trustedGuardian();

    const result = await guardians.turnOn({
      guardianAccountId: GUARDIAN,
      connectedAccountId: account.id,
      period: PERIOD,
    });

    expect(result.outcome).toBe('started');
    expect(calmSessions.all()[0]?.startedBy).toBe(guardianship.id);
  });

  it("is refused for an account the user hasn't allowed", async () => {
    const { guardians, trustedGuardian, account, calmSessions } = await setUp();
    await trustedGuardian();
    await guardians.setPermission({
      accountId: USER,
      connectedAccountId: account.id,
      allowed: false,
    });

    const result = await guardians.turnOn({
      guardianAccountId: GUARDIAN,
      connectedAccountId: account.id,
      period: PERIOD,
    });

    expect(result).toEqual({ outcome: 'not-allowed' });
    expect(calmSessions.all()).toEqual([]);
  });

  it('is refused once the user has removed the Guardian', async () => {
    const { guardians, trustedGuardian, account } = await setUp();
    const guardianship = await trustedGuardian();
    await guardians.remove({ accountId: USER, guardianshipId: guardianship.id });

    expect(
      await guardians.turnOn({
        guardianAccountId: GUARDIAN,
        connectedAccountId: account.id,
        period: PERIOD,
      }),
    ).toEqual({ outcome: 'not-allowed' });
  });

  it('is refused for someone who is not their Guardian', async () => {
    const { guardians, trustedGuardian, account } = await setUp();
    await trustedGuardian();

    expect(
      await guardians.turnOn({
        guardianAccountId: STRANGER,
        connectedAccountId: account.id,
        period: PERIOD,
      }),
    ).toEqual({ outcome: 'not-allowed' });
  });

  it('waits until the user has been through Review for that account', async () => {
    const { guardians, trustedGuardian, account, calmMode, platform } = await setUp();
    await trustedGuardian();
    platform.publish(account.id, aPost('2026-11-10T09:00:00.000Z'));
    await calmMode.activate({ accountId: USER, connectedAccountId: account.id, period: PERIOD });
    await calmMode.turnOff({ accountId: USER, connectedAccountId: account.id });

    const result = await guardians.turnOn({
      guardianAccountId: GUARDIAN,
      connectedAccountId: account.id,
      period: PERIOD,
    });

    expect(result).toEqual({ outcome: 'review-waiting' });
    const [protecting] = await guardians.protecting(GUARDIAN);
    expect(protecting?.connectedAccounts[0]?.canTurnOn).toBe('review-waiting');
  });

  it('has no way to turn Calm Mode off: only the user can', () => {
    const { turnOn, ...everythingElse } = Object.fromEntries(
      Object.keys(createGuardians({} as never)).map((name) => [name, true]),
    );

    expect(turnOn).toBe(true);
    expect(
      Object.keys(everythingElse).some((name) => /off|restore|archive|review/i.test(name)),
    ).toBe(false);
  });
});

describe('ending it', () => {
  it('lets a Guardian step down', async () => {
    const { guardians, trustedGuardian, guardianships } = await setUp();
    const guardianship = await trustedGuardian();

    await guardians.stepDown({
      guardianAccountId: GUARDIAN,
      guardianEmail: GUARDIAN_EMAIL,
      guardianshipId: guardianship.id,
    });

    expect(guardianships.all()).toEqual([]);
  });
});
