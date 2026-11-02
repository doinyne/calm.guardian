import { Writable } from 'node:stream';

import { createLogger, type Logger } from '../logger';

export type LogCapture = {
  logger: Logger;
  /** Every line written so far, unparsed. Use for "never contains" checks. */
  output: () => string;
  /** Every line written so far, parsed. */
  entries: () => Record<string, unknown>[];
};

/** A real logger (with real redaction) that writes to memory instead of stdout. */
export function captureLogs(): LogCapture {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });

  return {
    logger: createLogger({ level: 'trace', destination }),
    output: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
