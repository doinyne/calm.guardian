import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SIGN_IN_CODE_LENGTH } from './sign-in-code';

const SUPABASE_DIR = join(__dirname, '..', '..', '..', '..', '..', 'supabase');
const config = readFileSync(join(SUPABASE_DIR, 'config.toml'), 'utf8');

describe('sign-in code settings', () => {
  it('match the code length Supabase sends', () => {
    expect(/^otp_length = (\d+)$/m.exec(config)?.[1]).toBe(String(SIGN_IN_CODE_LENGTH));
  });

  it('send the code itself, not a link, for new and returning users', () => {
    for (const template of ['magic_link', 'confirmation']) {
      const section = new RegExp(
        `\\[auth\\.email\\.template\\.${template}\\][^[]*content_path = "\\./supabase/(\\S+)"`,
      ).exec(config);
      const email = readFileSync(join(SUPABASE_DIR, section?.[1] ?? 'missing'), 'utf8');

      expect(email).toContain('{{ .Token }}');
      expect(email).not.toContain('ConfirmationURL');
    }
  });
});
