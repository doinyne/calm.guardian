// Writes Expo Router's typed routes (.expo/types/router.d.ts) without starting Metro, so
// `npm run typecheck` checks every link against the real routes, in CI as well as locally. This is
// the same call Expo CLI makes when Metro starts (@expo/cli .../type-generation/routes.js).
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const typesDirectory = path.join(projectRoot, '.expo', 'types');
process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, 'src', 'app');

const { regenerateDeclarations } = require('@expo/router-server/build/typed-routes');

fs.mkdirSync(typesDirectory, { recursive: true });
regenerateDeclarations(typesDirectory);
