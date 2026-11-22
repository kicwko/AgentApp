import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import type { User } from './firebaseAuth';
import type { AccountStatusData } from '../screens/AccountStatusScreen';

const STORAGE_KEYS = {
  USER: '@kwiqo_partner_session_user',
  ACCOUNT_STATUS: '@kwiqo_partner_session_status',
  AUTH_TOKEN: '@kwiqo_partner_session_token',
};

export interface StoredSession {
  user: User | null;
  accountStatus: AccountStatusData | null;
  token: string | null;
}

/**
 * Session persistence service.
 * Preserves partner session across app restarts, background kills, and device reboots.
 */
export const sessionService = {
  /** Save active user session */
  saveUser: async (user: User | null): Promise<void> => {
    try {
      if (user) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        apiClient.setUserSession({
          phone: user.phoneNumber || null,
          userId: user.uid || null,
        });
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
        apiClient.setUserSession({
          phone: null,
          userId: null,
        });
      }
    } catch (e) {
      console.warn('[sessionService] Failed to save user session:', e);
    }
  },

  /** Save account status (Pending / Blocked / Active checklist) */
  saveAccountStatus: async (status: AccountStatusData | null): Promise<void> => {
    try {
      if (status) {
        await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNT_STATUS, JSON.stringify(status));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.ACCOUNT_STATUS);
      }
    } catch (e) {
      console.warn('[sessionService] Failed to save account status:', e);
    }
  },

  /** Save backend auth token */
  saveToken: async (token: string | null): Promise<void> => {
    try {
      if (token) {
        await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
        apiClient.setAuthToken(token);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        apiClient.setAuthToken(null);
      }
    } catch (e) {
      console.warn('[sessionService] Failed to save token:', e);
    }
  },

  /** Load entire persisted session on app startup */
  loadSession: async (): Promise<StoredSession> => {
    try {
      const [userJson, statusJson, token] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.ACCOUNT_STATUS),
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
      ]);

      const user: User | null = userJson ? JSON.parse(userJson) : null;
      const accountStatus: AccountStatusData | null = statusJson ? JSON.parse(statusJson) : null;

      if (user) {
        apiClient.setUserSession({
          phone: user.phoneNumber || null,
          userId: user.uid || null,
          token: token || null,
        });
      } else if (token) {
        apiClient.setAuthToken(token);
      }

      return {
        user,
        accountStatus,
        token: token || null,
      };
    } catch (e) {
      console.warn('[sessionService] Failed to load session:', e);
      return { user: null, accountStatus: null, token: null };
    }
  },

  /** Clear all session data and all persistent caches on explicit user sign-out */
  clearSession: async (): Promise<void> => {
    try {
      await AsyncStorage.clear();
      apiClient.clearSession();
    } catch (e) {
      console.warn('[sessionService] Failed to clear session:', e);
      try {
        await Promise.all([
          AsyncStorage.removeItem(STORAGE_KEYS.USER),
          AsyncStorage.removeItem(STORAGE_KEYS.ACCOUNT_STATUS),
          AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
        ]);
        apiClient.clearSession();
      } catch {}
    }
  },

  /** Alias to wipe all application caches */
  clearAllCaches: async (): Promise<void> => {
    try {
      await AsyncStorage.clear();
      apiClient.clearSession();
    } catch (e) {
      console.warn('[sessionService] Failed to clear all caches:', e);
    }
  },
};
