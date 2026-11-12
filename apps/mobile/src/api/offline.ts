/**
 * Whether a failed request means the phone couldn't reach us at all (no signal, airplane mode), as
 * opposed to our API answering with an error. `fetch` rejects with a `TypeError` only in that case.
 */
export function isOffline(error: unknown): boolean {
  return error instanceof TypeError;
}
