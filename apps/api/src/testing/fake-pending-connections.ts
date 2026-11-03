import type { PendingConnection, PendingConnections } from '../connections/pending-connections';

/** In-memory pending connections. Codes are single-use, like the real ones. */
export class FakePendingConnections implements PendingConnections {
  private readonly held = new Map<string, PendingConnection>();
  private issued = 0;

  hold(pending: PendingConnection) {
    this.issued += 1;
    const code = `pending-code-${this.issued}`;
    this.held.set(code, pending);
    return Promise.resolve(code);
  }

  take(code: string) {
    const pending = this.held.get(code);
    this.held.delete(code);
    return Promise.resolve(pending);
  }
}
