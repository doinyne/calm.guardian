import { join } from 'node:path';

/** The real route tree, for `renderRouter`. Layout and guard mistakes show up in tests, not on a device. */
export const APP_ROUTES = join(__dirname, '..', 'app');
