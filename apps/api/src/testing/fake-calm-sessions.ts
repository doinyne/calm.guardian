import { randomUUID } from 'node:crypto';

import {
  canMoveTo,
  isOpen,
  type CalmSession,
  type CalmSessionFailure,
  type CalmSessionId,
  type CalmSessions,
  type CalmSessionState,
} from '../calm/calm-session';

export type FakeCalmSession = CalmSession & { failure?: CalmSessionFailure };

/** In-memory Calm sessions with the real rules: one open session per connected account, legal moves only. */
export class FakeCalmSessions implements CalmSessions {
  private readonly sessions: FakeCalmSession[] = [];

  all(): readonly FakeCalmSession[] {
    return this.sessions;
  }

  openFor({ connectedAccountId, period, startedAt }: Parameters<CalmSessions['openFor']>[0]) {
    const open = this.sessions.find(
      (session) => session.connectedAccountId === connectedAccountId && isOpen(session.state),
    );
    if (open) return Promise.resolve({ ...open });

    const session: FakeCalmSession = {
      id: randomUUID() as CalmSessionId,
      connectedAccountId,
      state: 'activating',
      period,
      startedAt,
    };
    this.sessions.push(session);
    return Promise.resolve({ ...session });
  }

  markActive({ calmSessionId }: Parameters<CalmSessions['markActive']>[0]) {
    this.moveTo(calmSessionId, 'active');
    return Promise.resolve();
  }

  markFailed({ calmSessionId, reason }: Parameters<CalmSessions['markFailed']>[0]) {
    this.moveTo(calmSessionId, 'failed').failure = reason;
    return Promise.resolve();
  }

  private moveTo(calmSessionId: CalmSessionId, state: CalmSessionState) {
    const session = this.sessions.find((candidate) => candidate.id === calmSessionId);
    if (!session) throw new Error(`No Calm session ${calmSessionId}`);
    if (!canMoveTo(session.state, state)) {
      throw new Error(`A Calm session can't move from ${session.state} to ${state}`);
    }
    session.state = state;
    return session;
  }
}
