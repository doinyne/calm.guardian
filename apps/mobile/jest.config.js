/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Loads Reanimated's and Worklets' web implementations, since Jest has no native runtime.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.css$': '<rootDir>/jest/css-stub.js',
    // The app resolves lucide's ES module build, which Jest can't load; its CommonJS build is the same icons.
    '^lucide-react-native$':
      '<rootDir>/../../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  // jest-expo's defaults, plus UI packages that publish untranspiled JSX or ESM.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@rn-primitives|uniwind|lucide-react-native))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
