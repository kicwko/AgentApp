import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { API_CONFIG } from '../config/api';
import { locationService } from './locationService';
import { orderService, type BackendOrder, type PollOrdersResponse } from './orderService';

const { BackgroundPollingModule } = NativeModules;

export type OrderCallback = (order: BackendOrder) => void;
export type PollResponseCallback = (data: PollOrdersResponse) => void;

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

  private pendingOrderSubscribers: Set<OrderCallback> = new Set();
  private pollResponseSubscribers: Set<PollResponseCallback> = new Set();

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

    // 2. Run initial foreground poll immediately, then every 30 seconds
    await this.executeForegroundPoll();
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.intervalTimer = setInterval(() => {
      this.executeForegroundPoll();
    }, 30000);
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
      const res = await orderService.pollOrders({
        lat: coords.lat,
        lng: coords.lng,
        role: 'agent',
        limit: 20,
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

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const orderPollingService = new OrderPollingServiceManager();
export default orderPollingService;
