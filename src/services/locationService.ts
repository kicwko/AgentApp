import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import apiClient, { ApiResponse } from './apiClient';
import { API_CONFIG } from '../config/api';

const { BackgroundPollingModule } = NativeModules;

export interface Coordinates {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface PermissionStatus {
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  notificationsGranted: boolean;
}

export interface GeocodeResult {
  house?: string;
  road?: string;
  street?: string;
  neighbourhood?: string;
  city?: string;
  state?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  pincode?: string;
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

// Fallback coordinates for Delhi NCR / Gurgaon DLF Hub
const DEFAULT_COORDINATES: Coordinates = {
  lat: 28.4595,
  lng: 77.0266,
  accuracy: 10,
};

/**
 * Handles proactive location permissions on install and app startup.
 * Prompts user for Fine & Coarse location, Notifications, and Background "Allow all the time" location.
 * Also provides accurate native GPS coordinates and reverse geocoding.
 */
export const locationService = {
  /**
   * Reverse geocode latitude and longitude to full address
   */
  lookupLocation: async (
    lat: number,
    lng: number
  ): Promise<ApiResponse<GeocodeResult>> => {
    return apiClient.get<GeocodeResult>(API_CONFIG.endpoints.locationGeocode, {
      lat,
      lng,
    });
  },

  /**
   * Proactively request location and notification permissions immediately after install or startup.
   */
  requestLocationPermissions: async (): Promise<PermissionStatus> => {
    if (Platform.OS !== 'android') {
      return {
        foregroundGranted: true,
        backgroundGranted: true,
        notificationsGranted: true,
      };
    }

    let notificationsGranted = true;
    let foregroundGranted = false;
    let backgroundGranted = false;

    try {
      // 1. Android 13+ (API 33+): Request POST_NOTIFICATIONS for dispatch alerts
      if (Platform.Version >= 33) {
        try {
          const notifRes = await PermissionsAndroid.request(
            'android.permission.POST_NOTIFICATIONS' as any,
            {
              title: 'Kweecko Dispatch Alerts',
              message:
                'Allow notifications so you are instantly alerted when orders are assigned in the background.',
              buttonPositive: 'Allow',
            }
          );
          notificationsGranted = notifRes === PermissionsAndroid.RESULTS.GRANTED;
        } catch (e) {
          console.log('[locationService] Notification permission notice:', e);
        }
      }

      // 2. Request Foreground Location (Fine and Coarse)
      const fgResults = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      const fineGranted =
        fgResults[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const coarseGranted =
        fgResults[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED;

      foregroundGranted = fineGranted || coarseGranted;

      if (!foregroundGranted) {
        return {
          foregroundGranted: false,
          backgroundGranted: false,
          notificationsGranted,
        };
      }

      // 3. Android 10+ (API 29+): Request Background Location ("Allow all the time")
      if (Platform.Version >= 29) {
        const bgStatus = await PermissionsAndroid.check(
          'android.permission.ACCESS_BACKGROUND_LOCATION' as any
        );

        if (!bgStatus) {
          const bgResult = await PermissionsAndroid.request(
            'android.permission.ACCESS_BACKGROUND_LOCATION' as any,
            {
              title: 'Kweecko Background Location Permission',
              message:
                'Kweecko requires "Allow all the time" location access to continuously check coordinates and poll assigned customer dispatches, even when your phone is locked or the app is minimized.',
              buttonPositive: 'Allow All The Time',
              buttonNegative: 'Keep While Using',
            }
          );
          backgroundGranted = bgResult === PermissionsAndroid.RESULTS.GRANTED;
        } else {
          backgroundGranted = true;
        }
      } else {
        backgroundGranted = true;
      }

      return {
        foregroundGranted,
        backgroundGranted,
        notificationsGranted,
      };
    } catch (err) {
      console.warn('[locationService] Error during permission request:', err);
      return {
        foregroundGranted,
        backgroundGranted,
        notificationsGranted,
      };
    }
  },

  /**
   * Check whether foreground and background location permissions are active.
   */
  checkPermissions: async (): Promise<PermissionStatus> => {
    if (Platform.OS !== 'android') {
      return {
        foregroundGranted: true,
        backgroundGranted: true,
        notificationsGranted: true,
      };
    }

    try {
      const fineGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      const coarseGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
      );
      const foregroundGranted = fineGranted || coarseGranted;

      let backgroundGranted = true;
      if (Platform.Version >= 29) {
        backgroundGranted = await PermissionsAndroid.check(
          'android.permission.ACCESS_BACKGROUND_LOCATION' as any
        );
      }

      let notificationsGranted = true;
      if (Platform.Version >= 33) {
        notificationsGranted = await PermissionsAndroid.check(
          'android.permission.POST_NOTIFICATIONS' as any
        );
      }

      return { foregroundGranted, backgroundGranted, notificationsGranted };
    } catch {
      return {
        foregroundGranted: false,
        backgroundGranted: false,
        notificationsGranted: true,
      };
    }
  },

  /**
   * Get accurate current GPS latitude and longitude directly from native Android LocationManager.
   */
  getCurrentCoordinates: async (): Promise<Coordinates> => {
    const mod = NativeModules.BackgroundPollingModule;
    if (mod?.getCurrentLocation) {
      try {
        const rawLoc = await mod.getCurrentLocation();
        if (rawLoc && typeof rawLoc.latitude === 'number' && typeof rawLoc.longitude === 'number') {
          return {
            lat: rawLoc.latitude,
            lng: rawLoc.longitude,
            accuracy: rawLoc.accuracy,
          };
        }
      } catch (e: any) {
        console.log('[locationService] Native location retrieval notice:', e?.message);
      }
    }

    // Web / JS fallback
    const nav = (globalThis as any).navigator;
    if (nav?.geolocation?.getCurrentPosition) {
      try {
        const pos: any = await new Promise((resolve, reject) => {
          nav.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 4000,
            enableHighAccuracy: true,
          });
        });
        if (pos?.coords?.latitude && pos?.coords?.longitude) {
          return {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
        }
      } catch {}
    }

    return DEFAULT_COORDINATES;
  },
};

export default locationService;
