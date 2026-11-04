module.exports = {
  preset: '@react-native/jest-preset',
  // Firebase and Google Sign-In ship ES module builds that Jest can't parse
  // out of the box. Extend the preset's default pattern (which only allows
  // react-native/@react-native/@react-native-community) to also transform
  // these packages instead of treating them as plain CommonJS.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-firebase|@react-native-google-signin)/)',
  ],
};
