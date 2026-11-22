import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { API_CONFIG } from '../config/api';
import { locationService } from './locationService';
import { orderService, type BackendOrder, type PollOrdersResponse } from './orderService';

const { BackgroundPollingModule } = NativeModules;

export type OrderCallback = (order: BackendOrder) => void;
export type PollResponseCallback = (data: PollOrdersResponse) => void;
export type NotificationActionCallback = (orderId: string) => void;

interface PollingConfig {
  phone?: string | null;
  userId?: string | null;
  token?: string | null;
  baseUrl?: string;
}

class OrderPollingServiceManager {
  private isRunning: boolean = false;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private eventEmitter: NativeEventEmitter | null = null;
  private currentConfig: PollingConfig = {};
  private cachedPendingOrder: BackendOrder | null = null;

  private pendingOrderSubscribers: Set<OrderCallback> = new Set();
  private pollResponseSubscribers: Set<PollResponseCallback> = new Set();
  private acceptedActionSubscribers: Set<NotificationActionCallback> = new Set();
  private declinedActionSubscribers: Set<NotificationActionCallback> = new Set();

  constructor() {
    if (Platform.OS === 'android' && BackgroundPollingModule) {
      this.eventEmitter = new NativeEventEmitter(BackgroundPollingModule);
      this.setupNativeListeners();
    }
  }

  private getNativeModule() {
    return NativeModules.BackgroundPollingModule;
  }

  private setupNativeListeners() {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod) {
      this.eventEmitter = new NativeEventEmitter(mod);
    }
    if (!this.eventEmitter) return;

    // Listen to new pending order alerts from the native background service
    this.eventEmitter.addListener('onNewPendingOrder', (payload: any) => {
      try {
        const order: BackendOrder =
          typeof payload === 'string' ? JSON.parse(payload) : payload;
        this.cachedPendingOrder = order;
        this.notifyPendingOrderSubscribers(order);
      } catch (err) {
        console.warn('[OrderPollingService] Failed parsing native pending order:', err);
      }
    });

    // Listen to all poll updates from native background service
    this.eventEmitter.addListener('onOrdersPolled', (payload: any) => {
      try {
        const data: PollOrdersResponse =
          typeof payload === 'string' ? JSON.parse(payload) : payload;
        this.notifyPollResponseSubscribers(data);
      } catch (err) {
        console.warn('[OrderPollingService] Failed parsing native poll response:', err);
      }
    });

    // Listen to notification action triggers (ACCEPT/DECLINE pressed in notification)
    this.eventEmitter.addListener('onOrderAcceptedFromNotification', (orderId: any) => {
      const id = String(orderId || '');
      this.acceptedActionSubscribers.forEach(cb => {
        try {
          cb(id);
        } catch (err) {
          console.warn('[OrderPollingService] Error in acceptedAction callback:', err);
        }
      });
    });

    this.eventEmitter.addListener('onOrderDeclinedFromNotification', (orderId: any) => {
      const id = String(orderId || '');
      this.declinedActionSubscribers.forEach(cb => {
        try {
          cb(id);
        } catch (err) {
          console.warn('[OrderPollingService] Error in declinedAction callback:', err);
        }
      });
    });
  }

  /**
   * Start both the native Android background polling service (which runs continuously even when
   * app is minimized/phone locked) and the foreground JS polling cycle.
   */
  public async start(config: PollingConfig = {}): Promise<void> {
    this.currentConfig = { ...this.currentConfig, ...config };
    this.isRunning = true;

    const cleanPhone = this.currentConfig.phone
      ? this.currentConfig.phone.replace(/\D/g, '').slice(-10)
      : '';

    // 1. Start Android native Foreground Service
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.startBackgroundPolling) {
      try {
        await mod.startBackgroundPolling({
          phone: cleanPhone,
          userId: this.currentConfig.userId || cleanPhone,
          token: this.currentConfig.token || '',
          baseUrl: this.currentConfig.baseUrl || API_CONFIG.baseUrl,
        });
      } catch (e: any) {
        console.log('[OrderPollingService] Notice starting native background service:', e?.message);
      }
    }

    // 2. Run initial foreground poll immediately, then every 15 seconds
    await this.executeForegroundPoll();
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.intervalTimer = setInterval(() => {
      this.executeForegroundPoll();
    }, 15000);
  }

  /**
   * Stop background service and foreground polling interval.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.stopBackgroundPolling) {
      try {
        await mod.stopBackgroundPolling();
      } catch (e: any) {
        console.log('[OrderPollingService] Notice stopping native background service:', e?.message);
      }
    }
  }

  /**
   * Single poll execution: obtains GPS coordinates and calls /api/orders/poll
   */
  public async executeForegroundPoll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const coords = await locationService.getCurrentCoordinates();
      const cleanPhone = this.currentConfig.phone
        ? this.currentConfig.phone.replace(/\D/g, '').slice(-10)
        : undefined;

      const res = await orderService.pollOrders({
        lat: coords.lat,
        lng: coords.lng,
        role: 'agent',
        limit: 20,
        phone: cleanPhone,
        userId: this.currentConfig.userId || undefined,
      });

      if (res && res.success && res.data) {
        const pollData = res.data;
        this.notifyPollResponseSubscribers(pollData);

        const candidateOrders: BackendOrder[] = [
          ...(pollData.latestOrder ? [pollData.latestOrder] : []),
          ...(Array.isArray(pollData.orders) ? pollData.orders : []),
          ...(Array.isArray(pollData.data) ? pollData.data : []),
        ];

        const pending = candidateOrders.find(o => o.status === 'Pending');
        if (pending) {
          this.notifyPendingOrderSubscribers(pending);
        }
      }
    } catch (err: any) {
      console.log('[OrderPollingService] Foreground poll notice:', err?.message);
    }
  }

  /**
   * Subscribe to new incoming pending orders.
   */
  public subscribeToPendingOrders(callback: OrderCallback): () => void {
    this.pendingOrderSubscribers.add(callback);
    return () => {
      this.pendingOrderSubscribers.delete(callback);
    };
  }

  /**
   * Subscribe to raw poll responses.
   */
  public subscribeToPollResponses(callback: PollResponseCallback): () => void {
    this.pollResponseSubscribers.add(callback);
    return () => {
      this.pollResponseSubscribers.delete(callback);
    };
  }

  private notifyPendingOrderSubscribers(order: BackendOrder) {
    this.pendingOrderSubscribers.forEach(cb => {
      try {
        cb(order);
      } catch (err) {
        console.warn('[OrderPollingService] Error in subscriber callback:', err);
      }
    });
  }

  private notifyPollResponseSubscribers(data: PollOrdersResponse) {
    this.pollResponseSubscribers.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.warn('[OrderPollingService] Error in poll subscriber callback:', err);
      }
    });
  }

  /**
   * Subscribe to notification action: user accepted order from notification shade
   */
  public subscribeToAcceptedAction(callback: NotificationActionCallback): () => void {
    this.acceptedActionSubscribers.add(callback);
    return () => {
      this.acceptedActionSubscribers.delete(callback);
    };
  }

  /**
   * Subscribe to notification action: user declined order from notification shade
   */
  public subscribeToDeclinedAction(callback: NotificationActionCallback): () => void {
    this.declinedActionSubscribers.add(callback);
    return () => {
      this.declinedActionSubscribers.delete(callback);
    };
  }

  /**
   * Start continuous looping ringtone and pulsing vibration for incoming dispatch.
   */
  public async startRinging(): Promise<void> {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.startRinging) {
      try {
        await mod.startRinging();
      } catch (e: any) {
        console.log('[OrderPollingService] Notice starting ringtone:', e?.message);
      }
    }
  }

  /**
   * Stop continuous ringtone and vibration immediately (upon Accept, Decline, or Dismiss).
   */
  public async stopRinging(): Promise<void> {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.stopRinging) {
      try {
        await mod.stopRinging();
      } catch (e: any) {
        console.log('[OrderPollingService] Notice stopping ringtone:', e?.message);
      }
    }
  }

  /**
   * Check whether ringtone is currently playing.
   */
  public async isRinging(): Promise<boolean> {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.isRinging) {
      try {
        return await mod.isRinging();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Get latest pending order delivered via push notification click or background service.
   */
  public async getLatestPendingOrder(): Promise<BackendOrder | null> {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.getLatestPendingOrder) {
      try {
        const raw = await mod.getLatestPendingOrder();
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          this.cachedPendingOrder = parsed;
          return parsed;
        }
      } catch (err) {
        console.warn('[OrderPollingService] Failed reading latest pending order:', err);
      }
    }
    return this.cachedPendingOrder;
  }

  /**
   * Clear latest pending order once handled.
   */
  public async clearLatestPendingOrder(): Promise<void> {
    this.cachedPendingOrder = null;
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.clearLatestPendingOrder) {
      try {
        await mod.clearLatestPendingOrder();
      } catch {}
    }
  }

  /**
   * Request Android battery optimization exemption so background polling and network
   * are not killed or throttled during Doze mode or when the phone screen is locked.
   */
  public async requestBatteryOptimizationExemption(): Promise<boolean> {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.requestBatteryOptimizationExemption) {
      try {
        return await mod.requestBatteryOptimizationExemption();
      } catch {
        return true;
      }
    }
    return true;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const orderPollingService = new OrderPollingServiceManager();
export default orderPollingService;
