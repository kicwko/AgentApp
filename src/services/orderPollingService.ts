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
  private isOnDuty: boolean = true;
  private isAlertActive: boolean = false;
  private alertTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private eventEmitter: NativeEventEmitter | null = null;
  private currentConfig: PollingConfig = {};
  private cachedPendingOrder: BackendOrder | null = null;
  private declinedOrderIds: Set<string> = new Set();

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
        const oId = order._id || '';
        const oCode = order.orderId || '';
        if (this.declinedOrderIds.has(oId) || this.declinedOrderIds.has(oCode)) {
          return;
        }
        this.cachedPendingOrder = order;
        this.setAlertActive(true);
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
      this.markOrderDeclined(id);
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

    // 2. Run initial foreground poll immediately, then every 25 seconds
    await this.executeForegroundPoll();
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.intervalTimer = setInterval(() => {
      this.executeForegroundPoll();
    }, 25000);
  }

  /**
   * Stop background service and foreground polling interval.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.setAlertActive(false);
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
   * Set on-duty availability state. When off-duty, stops background service
   * and prevents polling API calls.
   */
  public setOnDuty(onDuty: boolean): void {
    this.isOnDuty = onDuty;
    if (!onDuty) {
      this.stop().catch(() => {});
    }
  }

  public getOnDuty(): boolean {
    return this.isOnDuty;
  }

  /**
   * Single poll execution: obtains GPS coordinates and calls /api/orders/poll.
   * If an active order alert is running on screen/phone, polling is skipped.
   */
  public async executeForegroundPoll(): Promise<void> {
    if (!this.isRunning || !this.isOnDuty || this.isAlertActive) return;

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

        const pending = candidateOrders.find(
          o =>
            o.status === 'Pending' &&
            !this.declinedOrderIds.has(o._id || '') &&
            !this.declinedOrderIds.has(o.orderId || '')
        );
        if (pending) {
          this.setAlertActive(true);
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
   * Mark order as declined across both JS state and native background service.
   */
  public markOrderDeclined(orderKey?: string, humanOrderId?: string, mongoId?: string): void {
    if (orderKey) this.declinedOrderIds.add(orderKey);
    if (humanOrderId) this.declinedOrderIds.add(humanOrderId);
    if (mongoId) this.declinedOrderIds.add(mongoId);

    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.markOrderDeclined) {
      if (orderKey) mod.markOrderDeclined(orderKey).catch(() => {});
      if (humanOrderId && humanOrderId !== orderKey) mod.markOrderDeclined(humanOrderId).catch(() => {});
      if (mongoId && mongoId !== orderKey) mod.markOrderDeclined(mongoId).catch(() => {});
    }
  }

  public isOrderDeclined(orderId?: string | null): boolean {
    if (!orderId) return false;
    return this.declinedOrderIds.has(orderId);
  }

  public updateOrderStatusInBackground(
    orderId: string,
    status: string,
    reason?: string
  ): void {
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.updateOrderStatusInBackground) {
      mod.updateOrderStatusInBackground(orderId, status, reason || null).catch(() => {});
    }
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
    this.setAlertActive(false);
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
   * Set alert active flag to prevent polling API calls while an order alert is running.
   */
  public setAlertActive(active: boolean): void {
    this.isAlertActive = active;
    if (this.alertTimeoutId) {
      clearTimeout(this.alertTimeoutId);
      this.alertTimeoutId = null;
    }
    if (active) {
      // Auto-expire alert active flag after 5 minutes (300,000 ms)
      this.alertTimeoutId = setTimeout(() => {
        this.setAlertActive(false);
      }, 300000);
    }
    const mod = this.getNativeModule();
    if (Platform.OS === 'android' && mod?.setAlertActive) {
      mod.setAlertActive(active).catch(() => {});
    }
  }

  public getAlertActive(): boolean {
    return this.isAlertActive;
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
    this.setAlertActive(false);
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
