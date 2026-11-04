/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// App.tsx wires up Firebase Auth / Google Sign-In, which need a real native
// bridge that doesn't exist in the Jest environment. Mock the service layer
// so this stays a plain smoke test of the component tree.
jest.mock('../src/services/firebaseAuth', () => ({
  subscribeToAuthState: (callback: (user: null) => void) => {
    callback(null);
    return () => {};
  },
}));
jest.mock('../src/services/googleAuth', () => ({
  configureGoogleSignIn: () => {},
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
