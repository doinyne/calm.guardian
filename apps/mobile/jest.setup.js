/* global jest */
require('react-native-reanimated').setUpTests();

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The values a local dev build would have, so modules that read config at import time load.
process.env.EXPO_PUBLIC_APP_VARIANT = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
