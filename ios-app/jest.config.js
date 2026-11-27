module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/', '/ios/'],
  clearMocks: true,
  moduleNameMapper: {
    '^react-native-quick-crypto$': '<rootDir>/__mocks__/quick-crypto.js'
  }
};
