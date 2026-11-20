import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { locationService } from '../src/services/locationService';
import { orderPollingService } from '../src/services/orderPollingService';
import { orderService } from '../src/services/orderService';

jest.mock('../src/services/orderService');

describe('Location & Background Polling Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('locationService', () => {
    it('requestLocationPermissions requests foreground, background, and notification permissions on Android', async () => {
      Platform.OS = 'android';
      (Platform as any).Version = 33;

      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValueOnce({
        'android.permission.ACCESS_FINE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
        'android.permission.ACCESS_COARSE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
      } as any);

      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValueOnce(false); // background check
      jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED); // notif & background

      const status = await locationService.requestLocationPermissions();

      expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      expect(status.foregroundGranted).toBe(true);
      expect(status.backgroundGranted).toBe(true);
    });

    it('getCurrentCoordinates returns accurate coordinates from native module', async () => {
      NativeModules.BackgroundPollingModule = {
        getCurrentLocation: jest.fn().mockResolvedValueOnce({
          latitude: 28.5355,
          longitude: 77.3910,
          accuracy: 5.0,
        }),
      };

      const coords = await locationService.getCurrentCoordinates();
      expect(coords.lat).toBe(28.5355);
      expect(coords.lng).toBe(77.3910);
    });
  });

  describe('orderPollingService', () => {
    it('start() launches native background polling service and calls pollOrders', async () => {
      NativeModules.BackgroundPollingModule = {
        startBackgroundPolling: jest.fn().mockResolvedValueOnce(true),
        stopBackgroundPolling: jest.fn().mockResolvedValueOnce(true),
        getCurrentLocation: jest.fn().mockResolvedValueOnce({
          latitude: 28.5355,
          longitude: 77.3910,
        }),
      };

      (orderService.pollOrders as jest.Mock).mockResolvedValueOnce({
        success: true,
        data: {
          hasNewOrder: false,
          orders: [],
        },
      });

      await orderPollingService.start({
        phone: '9625650723',
        userId: 'agent-123',
      });

      expect(NativeModules.BackgroundPollingModule.startBackgroundPolling).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '9625650723',
          userId: 'agent-123',
        })
      );
      expect(orderService.pollOrders).toHaveBeenCalled();

      await orderPollingService.stop();
      expect(NativeModules.BackgroundPollingModule.stopBackgroundPolling).toHaveBeenCalled();
    });

    it('startRinging and stopRinging invoke native ringtone manager methods', async () => {
      NativeModules.BackgroundPollingModule = {
        startRinging: jest.fn().mockResolvedValueOnce(true),
        stopRinging: jest.fn().mockResolvedValueOnce(true),
        isRinging: jest.fn().mockResolvedValueOnce(true),
      };

      await orderPollingService.startRinging();
      expect(NativeModules.BackgroundPollingModule.startRinging).toHaveBeenCalled();

      const ringing = await orderPollingService.isRinging();
      expect(ringing).toBe(true);

      await orderPollingService.stopRinging();
      expect(NativeModules.BackgroundPollingModule.stopRinging).toHaveBeenCalled();
    });
  });
});
