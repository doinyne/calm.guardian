import { randomUUID } from 'node:crypto';

import {
  canMoveTo,
  isOpen,
  type CalmSession,
  type CalmSessionId,
  type CalmSessions,
  type CalmSessionState,
} from '../calm/calm-session';

export type FakeCalmSession = CalmSession & { claimedUntil?: Date };

/** In-memory Calm sessions with the real rules: one open session per connected account, legal moves only. */
export class FakeCalmSessions implements CalmSessions {
  private readonly sessions: FakeCalmSession[] = [];

  all(): readonly FakeCalmSession[] {
    return this.sessions;
  }

  openFor({
    accountId,
    connectedAccountId,
    period,
    startedAt,
  }: Parameters<CalmSessions['openFor']>[0]) {
    const open = this.sessions.find(
      (session) => session.connectedAccountId === connectedAccountId && isOpen(session.state),
    );
    if (open) return Promise.resolve({ ...open });

    const session: FakeCalmSession = {
      id: randomUUID() as CalmSessionId,
      accountId,
      connectedAccountId,
      state: 'activating',
      period,
      startedAt,
      failure: null,
      resumeCursor: null,
    };
    this.sessions.push(session);
    return Promise.resolve({ ...session });
  }

  find(calmSessionId: CalmSessionId) {
    const session = this.sessions.find((candidate) => candidate.id === calmSessionId);
    return Promise.resolve(session ? { ...session } : undefined);
  }

  saveProgress({ calmSessionId, resumeCursor }: Parameters<CalmSessions['saveProgress']>[0]) {
    this.get(calmSessionId).resumeCursor = resumeCursor;
    return Promise.resolve();
  }

  claim({ calmSessionId, until, now }: Parameters<CalmSessions['claim']>[0]) {
    const session = this.get(calmSessionId);
    if (session.claimedUntil && session.claimedUntil > now) return Promise.resolve(false);
    session.claimedUntil = until;
    return Promise.resolve(true);
  }

  release(calmSessionId: CalmSessionId) {
    delete this.get(calmSessionId).claimedUntil;
    return Promise.resolve();
  }

  markActive({ calmSessionId }: Parameters<CalmSessions['markActive']>[0]) {
    this.moveTo(calmSessionId, 'active');
    return Promise.resolve();
  }

  markFailed({ calmSessionId, reason }: Parameters<CalmSessions['markFailed']>[0]) {
    this.moveTo(calmSessionId, 'failed').failure = reason;
    return Promise.resolve();
  }

  private get(calmSessionId: CalmSessionId) {
    const session = this.sessions.find((candidate) => candidate.id === calmSessionId);
    if (!session) throw new Error(`No Calm session ${calmSessionId}`);
    return session;
  }

  private moveTo(calmSessionId: CalmSessionId, state: CalmSessionState) {
    const session = this.get(calmSessionId);
    if (!canMoveTo(session.state, state)) {
      throw new Error(`A Calm session can't move from ${session.state} to ${state}`);
    }
    session.state = state;
    return session;
  }
}
