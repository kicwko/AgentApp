module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Firebase, Google Sign-In, and Async Storage ship ES module builds that Jest can't parse
  // out of the box. Extend the preset's default pattern to also transform these packages.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-firebase|@react-native-google-signin|@react-native-async-storage|react-native-image-picker)/)',
  ],
};
