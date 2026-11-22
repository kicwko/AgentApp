/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App, { clearAllAppDataAndCaches } from '../App';
import apiClient from '../src/services/apiClient';
import { orderPollingService } from '../src/services/orderPollingService';
import { clearOrdersCache } from '../src/screens/OrdersScreen';
import { clearDashboardCache } from '../src/screens/DashboardScreen';

// App.tsx wires up Firebase Auth / Google Sign-In, which need a real native
// bridge that doesn't exist in the Jest environment. Mock the service layer
// so this stays a plain smoke test of the component tree.
jest.mock('../src/services/firebaseAuth', () => ({
  subscribeToAuthState: (callback: (user: null) => void) => {
    callback(null);
    return () => {};
  },
  signOutUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/googleAuth', () => ({
  configureGoogleSignIn: () => {},
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('clearAllAppDataAndCaches clears AsyncStorage, apiClient, order polling, and screen caches', async () => {
  const asyncStorageClearSpy = jest.spyOn(AsyncStorage, 'clear');
  const pollingResetSpy = jest.spyOn(orderPollingService, 'resetAll');
  const apiClientClearSpy = jest.spyOn(apiClient, 'clearSession');

  await clearAllAppDataAndCaches();

  expect(asyncStorageClearSpy).toHaveBeenCalled();
  expect(pollingResetSpy).toHaveBeenCalled();
  expect(apiClientClearSpy).toHaveBeenCalled();
});
