const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving node_modules via their "source" field
// (fixes react-native-svg src/index.ts resolution error)
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
