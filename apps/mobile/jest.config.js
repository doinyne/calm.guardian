/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Loads Reanimated's and Worklets' web implementations, since Jest has no native runtime.
  resolver: 'react-native-reanimated/jest/resolver',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // jest-expo's defaults, plus UI packages that publish untranspiled JSX or ESM.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@rn-primitives|uniwind|lucide-react-native))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
