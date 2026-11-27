/**
 * Node-only adapter for unit tests. Production iPhone builds resolve the real
 * react-native-quick-crypto native module through Metro autolinking.
 */
const crypto = require('crypto');

module.exports = {
  ...crypto,
  install: () => undefined
};
