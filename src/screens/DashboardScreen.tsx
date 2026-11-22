import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GradientButton } from '../components/GradientButton';
import { IncomingDispatchModal } from '../components/IncomingDispatchModal';
import { orderService, type BackendOrder } from '../services/orderService';
import { orderPollingService } from '../services/orderPollingService';
import { locationService } from '../services/locationService';
import { userService } from '../services/userService';
import apiClient from '../services/apiClient';
import type { User } from '../services/firebaseAuth';

function calculateDashboardMetrics(orders: BackendOrder[]) {
  const now = new Date();

  // Helper to check if date is today (same local calendar day)
  const isSameDay = (dateStr?: string | null) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    } catch {
      return false;
    }
  };

  // Helper to check if date is in current month
  const isSameMonth = (dateStr?: string | null) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    } catch {
      return false;
    }
  };

  // Helper to check if date falls in current calendar week (Monday to Sunday) or last 7 days
  const isCurrentWeek = (dateStr?: string | null) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const dayOfWeek = now.getDay();
      const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(monday);
      endOfWeek.setDate(monday.getDate() + 7);

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return (d >= monday && d <= endOfWeek) || (d >= sevenDaysAgo && d <= now);
    } catch {
      return false;
    }
  };

  // 1. Today's Visits: completed visits today out of total orders for today
  const todayOrders = orders.filter(
    o =>
      isSameDay(o.completedAt) ||
      isSameDay(o.scheduledDate) ||
      isSameDay(o.createdAt) ||
      isSameDay(o.updatedAt)
  );
  const todayCompleted = todayOrders.filter(o => o.status === 'Done');

  let visitsText = '0 / 0';
  if (todayCompleted.length > 0) {
    visitsText = `${todayCompleted.length} / ${todayOrders.length || todayCompleted.length}`;
  } else if (todayOrders.length > 0) {
    visitsText = `0 / ${todayOrders.length}`;
  }

  // 2. On-Time Gate: reached time of completed order
  const targetCompleted =
    todayCompleted.length > 0
      ? todayCompleted[0]
      : orders.find(o => o.status === 'Done');

  let gateText = orders.length > 0 ? '100%' : '-';
  if (targetCompleted) {
    let reachedMins: number | null = null;

    if (targetCompleted.startedAt && targetCompleted.completedAt) {
      const diff = Math.round(
        (new Date(targetCompleted.completedAt).getTime() -
          new Date(targetCompleted.startedAt).getTime()) /
          (1000 * 60)
      );
      if (diff > 0 && diff <= 180) reachedMins = diff;
    }

    if (!reachedMins && targetCompleted.rating?.comment) {
      const match = targetCompleted.rating.comment.match(
        /(\d+)\s*(?:min|mins|minutes)/i
      );
      if (match && match[1]) {
        reachedMins = parseInt(match[1], 10);
      }
    }

    if (reachedMins) {
      gateText = `${reachedMins} min`;
    } else {
      gateText = '100%';
    }
  }

  // 3. Weekly Earn: Total earnings from completed orders this week
  const weekCompletedOrders = orders.filter(
    o =>
      o.status === 'Done' &&
      (isCurrentWeek(o.completedAt) ||
        isCurrentWeek(o.scheduledDate) ||
        isCurrentWeek(o.createdAt))
  );

  let weekTotal = 0;
  for (const o of weekCompletedOrders) {
    const payout =
      o.agentPayment?.amount ||
      Math.round((o.totalPrice || 0) * 0.85) ||
      o.totalPrice ||
      0;
    weekTotal += payout;
  }

  let earnText = `₹${weekTotal.toLocaleString('en-IN')}`;
  if (weekTotal >= 10000) {
    earnText = `₹${(weekTotal / 1000).toFixed(1)}k`;
  }

  // 4. Today's Total Earnings
  let todayTotal = 0;
  for (const o of todayCompleted) {
    const payout =
      o.agentPayment?.amount ||
      Math.round((o.totalPrice || 0) * 0.85) ||
      o.totalPrice ||
      0;
    todayTotal += payout;
  }
  const todayTotalText = `₹${todayTotal.toLocaleString('en-IN')}`;
  const todayCompletedJobsText = `${todayCompleted.length} completed ${todayCompleted.length === 1 ? 'job' : 'jobs'}`;

  // 5. Month Total Earnings
  const monthCompletedOrders = orders.filter(
    o =>
      o.status === 'Done' &&
      (isSameMonth(o.completedAt) ||
        isSameMonth(o.scheduledDate) ||
        isSameMonth(o.createdAt))
  );
  let monthTotal = 0;
  for (const o of monthCompletedOrders) {
    const payout =
      o.agentPayment?.amount ||
      Math.round((o.totalPrice || 0) * 0.85) ||
      o.totalPrice ||
      0;
    monthTotal += payout;
  }
  const monthTotalText = `₹${monthTotal.toLocaleString('en-IN')}`;

  // 6. Rating & Orders Count
  const ratedOrders = orders.filter(
    o => o.rating && typeof o.rating.stars === 'number'
  );
  let ratingText = orders.length > 0 ? '5.0' : '-';
  if (ratedOrders.length > 0) {
    const avg =
      ratedOrders.reduce((sum, o) => sum + (o.rating!.stars || 0), 0) /
      ratedOrders.length;
    ratingText = avg.toFixed(1);
  }

  const completedCount = orders.filter(o => o.status === 'Done').length;
  const ordersQuarterText = `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} total`;
  const completionRateText =
    orders.length > 0
      ? `${Math.round((completedCount / orders.length) * 100)}%`
      : '100%';

  return {
    visitsText,
    gateText,
    earnText,
    todayTotalText,
    todayCompletedJobsText,
    monthTotalText,
    ratingText,
    ordersQuarterText,
    completionRateText,
  };
}

// In-memory persistent cache for instant tab restoration across screen switches
let cachedInProgressOrders: BackendOrder[] = [];
let cachedRecentOrders: BackendOrder[] = [];
let cachedDashboardStats = {
  todayVisitsText: '0 / 0',
  onTimeGateText: '-',
  weeklyEarnText: '₹0',
  todayTotalEarnings: '₹0',
  todayCompletedJobs: '0 completed jobs',
  monthTotalEarnings: '₹0',
  performanceRating: '-',
  ordersQuarterCount: '0 orders total',
  completionRate: '100%',
};

/**
 * Clear in-memory cached dashboard stats and orders (called on user sign out)
 */
export function clearDashboardCache(): void {
  cachedInProgressOrders = [];
  cachedRecentOrders = [];
  cachedDashboardStats = {
    todayVisitsText: '0 / 0',
    onTimeGateText: '-',
    weeklyEarnText: '₹0',
    todayTotalEarnings: '₹0',
    todayCompletedJobs: '0 completed jobs',
    monthTotalEarnings: '₹0',
    performanceRating: '-',
    ordersQuarterCount: '0 orders total',
    completionRate: '100%',
  };
}

export function DashboardScreen({
  user,
  isActive = true,
  isOnDuty = true,
  onSwitchToDashboard,
}: {
  user?: User;
  isActive?: boolean;
  isOnDuty?: boolean;
  onSwitchToDashboard?: () => void;
} = {}) {
  const [pendingOrder, setPendingOrder] = useState<BackendOrder | null>(null);
  const pendingOrderRef = useRef<BackendOrder | null>(null);
  pendingOrderRef.current = pendingOrder;
  const declinedOrderIdsRef = useRef<Set<string>>(new Set());
  const lastAcceptedToastTimeRef = useRef<number>(0);
  const isAcceptingInProgressRef = useRef<boolean>(false);

  const [pendingTimeLeft, setPendingTimeLeft] = useState<number>(300); // 5 minutes = 300 seconds
  const [orderAccepting, setOrderAccepting] = useState(false);
  const [orderDeclining, setOrderDeclining] = useState(false);

  const [inProgressOrders, setInProgressOrders] = useState<BackendOrder[]>(cachedInProgressOrders);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<BackendOrder[]>(cachedRecentOrders);

  const [userLocation, setUserLocation] = useState<{
    latitude?: number | null;
    longitude?: number | null;
  } | null>(null);

  const [todayVisitsText, setTodayVisitsText] = useState(cachedDashboardStats.todayVisitsText);
  const [onTimeGateText, setOnTimeGateText] = useState(cachedDashboardStats.onTimeGateText);
  const [weeklyEarnText, setWeeklyEarnText] = useState(cachedDashboardStats.weeklyEarnText);
  const [todayTotalEarnings, setTodayTotalEarnings] = useState(cachedDashboardStats.todayTotalEarnings);
  const [todayCompletedJobs, setTodayCompletedJobs] = useState(cachedDashboardStats.todayCompletedJobs);
  const [monthTotalEarnings, setMonthTotalEarnings] = useState(cachedDashboardStats.monthTotalEarnings);
  const [performanceRating, setPerformanceRating] = useState(cachedDashboardStats.performanceRating);
  const [ordersQuarterCount, setOrdersQuarterCount] = useState(cachedDashboardStats.ordersQuarterCount);
  const [completionRate, setCompletionRate] = useState(cachedDashboardStats.completionRate);
  const [refreshing, setRefreshing] = useState(false);

  const getAgentPhone = useCallback(() => {
    const raw = user?.phoneNumber || apiClient.getUserPhone() || '';
    return raw.replace(/\D/g, '').slice(-10);
  }, [user]);

  const getAgentId = useCallback(() => {
    const phone = getAgentPhone();
    return phone || apiClient.getUserId() || user?.uid || '';
  }, [getAgentPhone, user]);

  // Fetch agent profile location if available
  useEffect(() => {
    const cleanPhone = getAgentPhone();
    if (cleanPhone) {
      userService
        .fetchPartnerProfile({ phone: cleanPhone })
        .then((res: any) => {
          if (res && res.success && res.data?.location) {
            setUserLocation(res.data.location);
          }
        })
        .catch(() => {});
    }
  }, [getAgentPhone]);

  // Retrieve current GPS / Cluster coordinates
  const getCoordinates = useCallback(async (): Promise<{ lat: number; lng: number }> => {
    if (
      userLocation?.latitude != null &&
      userLocation?.longitude != null &&
      !isNaN(userLocation.latitude) &&
      !isNaN(userLocation.longitude)
    ) {
      return { lat: userLocation.latitude, lng: userLocation.longitude };
    }

    try {
      const live = await locationService.getCurrentCoordinates();
      if (live && live.lat && live.lng) {
        return { lat: live.lat, lng: live.lng };
      }
    } catch (e) {
      console.log('[DashboardScreen] Notice getting coordinates:', e);
    }

    // Default Delhi NCR / DLF Gurgaon Cluster coordinates
    return { lat: 28.4595, lng: 77.0266 };
  }, [userLocation]);

  // Load all user orders from backend
  const loadDashboardData = useCallback(async () => {
    const cleanPhone = getAgentPhone();
    const agentId = getAgentId();

    try {
      const res = await orderService.getOrders({
        agentId: cleanPhone || agentId || undefined,
        limit: 50,
      });

      if (res && res.success && Array.isArray(res.data)) {
        // Filter strictly to current user's assigned orders
        const userOrders = res.data.filter(o => {
          if (cleanPhone) {
            const rawOPhone = (o.agentPhone || '').replace(/\D/g, '').slice(-10);
            if (rawOPhone && rawOPhone === cleanPhone) return true;
            if (o.agentId && o.agentId.includes(cleanPhone)) return true;
          }
          if (agentId && (o.agentId === agentId || o.agent === agentId)) return true;
          if (user?.email && (o.agentId?.includes(user.email) || o.customer?.email === user.email)) return true;
          if (user?.displayName && o.agentName && o.agentName.toLowerCase() === user.displayName.toLowerCase()) return true;
          return false;
        });

        const finalOrders =
          userOrders.length > 0 ? userOrders : res.data;

        // Extract in-progress tasks: 'In Transit' | 'In Progress'
        const activeInProgress = finalOrders.filter(
          o => o.status === 'In Transit' || o.status === 'In Progress'
        );
        cachedInProgressOrders = activeInProgress;
        setInProgressOrders(activeInProgress);

        // Check for any assigned pending orders (excluding declined ones)
        const foundPending = finalOrders.find(
          o =>
            o.status === 'Pending' &&
            !declinedOrderIdsRef.current.has(o._id || '') &&
            !declinedOrderIdsRef.current.has(o.orderId || '')
        );
        if (foundPending && !pendingOrderRef.current) {
          const createdMs = foundPending.createdAt
            ? new Date(foundPending.createdAt).getTime()
            : Date.now();
          const elapsedSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
          const remainSec = elapsedSec < 300 ? 300 - elapsedSec : 0;
          if (remainSec > 0) {
            setPendingOrder(foundPending);
            setPendingTimeLeft(remainSec);
          }
        }

        // Recent completed / historical orders for feed
        const completedFeed = finalOrders
          .filter(o => o.status === 'Done' || o.status === 'Canceled')
          .slice(0, 5);
        const finalRecent =
          completedFeed.length > 0 ? completedFeed : finalOrders.slice(0, 5);
        cachedRecentOrders = finalRecent;
        setRecentOrders(finalRecent);

        // Calculate and update metrics
        const metrics = calculateDashboardMetrics(finalOrders);
        cachedDashboardStats = {
          todayVisitsText: metrics.visitsText,
          onTimeGateText: metrics.gateText,
          weeklyEarnText: metrics.earnText,
          todayTotalEarnings: metrics.todayTotalText,
          todayCompletedJobs: metrics.todayCompletedJobsText,
          monthTotalEarnings: metrics.monthTotalText,
          performanceRating: metrics.ratingText,
          ordersQuarterCount: metrics.ordersQuarterText,
          completionRate: metrics.completionRateText,
        };
        setTodayVisitsText(metrics.visitsText);
        setOnTimeGateText(metrics.gateText);
        setWeeklyEarnText(metrics.earnText);
        setTodayTotalEarnings(metrics.todayTotalText);
        setTodayCompletedJobs(metrics.todayCompletedJobsText);
        setMonthTotalEarnings(metrics.monthTotalText);
        setPerformanceRating(metrics.ratingText);
        setOrdersQuarterCount(metrics.ordersQuarterText);
        setCompletionRate(metrics.completionRateText);
      }
    } catch (err: any) {
      console.warn('[DashboardScreen] Could not load live orders:', err?.message);
    }
  }, [getAgentPhone, getAgentId, user, pendingOrder]);

  // Refresh dashboard data when tab is switched to active
  useEffect(() => {
    if (isActive) {
      loadDashboardData().catch(() => {});
    }
  }, [isActive, loadDashboardData]);

  // Auto-decline handler when 5 minutes expire
  const handleAutoDecline = useCallback(
    async (order: BackendOrder) => {
      const orderKey = order._id || order.orderId || '';
      const mongoId = order._id || '';
      const humanOrderId = order.orderId || '';

      if (orderKey) declinedOrderIdsRef.current.add(orderKey);
      if (mongoId) declinedOrderIdsRef.current.add(mongoId);
      if (humanOrderId) declinedOrderIdsRef.current.add(humanOrderId);

      orderPollingService.markOrderDeclined(orderKey, humanOrderId, mongoId);
      orderPollingService.stopRinging().catch(() => {});
      orderPollingService.clearLatestPendingOrder().catch(() => {});
      orderPollingService.setAlertActive(false);
      setPendingOrder(null);
      pendingOrderRef.current = null;
      setPendingTimeLeft(0);

      try {
        console.log('[DashboardScreen] 5-minute timer expired for order:', orderKey);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auto-decline timeout')), 10000)
        );
        const declinePayload = {
          status: 'Canceled',
          reason: 'Expired - not accepted within 5 minutes',
          canceledBy: 'Agent',
          cancellationReason: 'Expired - not accepted within 5 minutes',
          markedBy: 'Agent',
          role: 'Agent',
        };
        await Promise.race([
          orderService.updateOrderStatus(orderKey, declinePayload),
          timeoutPromise,
        ]);
        if (Platform.OS === 'android') {
          ToastAndroid.show(
            'Order expired and auto-declined.',
            ToastAndroid.SHORT
          );
        }
      } catch (err) {
        console.warn('[DashboardScreen] Error auto-declining expired order:', err);
      } finally {
        orderPollingService.stopRinging().catch(() => {});
        orderPollingService.clearLatestPendingOrder().catch(() => {});
        orderPollingService.setAlertActive(false);
        setPendingOrder(null);
        pendingOrderRef.current = null;
        setPendingTimeLeft(0);
        await loadDashboardData().catch(() => {});
      }
    },
    [loadDashboardData]
  );

  // Poll API (/api/orders/poll) every 25 seconds
  const pollNewOrders = useCallback(async () => {
    // If user is offline (OFF DUTY) or an alert/pending order is active, do not call polling API
    if (!isOnDuty || pendingOrderRef.current || orderPollingService.getAlertActive()) {
      return;
    }

    try {
      const coords = await getCoordinates();
      const cleanPhone = getAgentPhone();
      const userId = getAgentId();

      const pollRes = await orderService.pollOrders({
        lat: coords.lat,
        lng: coords.lng,
        role: 'agent',
        limit: 20,
        phone: cleanPhone || undefined,
        userId: userId || undefined,
      });

      if (pollRes && pollRes.success && pollRes.data) {
        const pollData = pollRes.data;
        const candidateOrders: BackendOrder[] = [
          ...(pollData.latestOrder ? [pollData.latestOrder] : []),
          ...(Array.isArray(pollData.orders) ? pollData.orders : []),
          ...(Array.isArray(pollData.data) ? pollData.data : []),
        ];

        const incomingPending = candidateOrders.find(
          o =>
            o.status === 'Pending' &&
            !declinedOrderIdsRef.current.has(o._id || '') &&
            !declinedOrderIdsRef.current.has(o.orderId || '')
        );

        if (incomingPending) {
          const incomingKey = incomingPending._id || incomingPending.orderId;
          const currentKey: string | null = null;

          if (incomingKey !== currentKey) {
            const createdMs = incomingPending.createdAt
              ? new Date(incomingPending.createdAt).getTime()
              : Date.now();
            const elapsedSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
            const remainSec = elapsedSec < 300 ? 300 - elapsedSec : 0;

            if (remainSec <= 0) {
              await handleAutoDecline(incomingPending);
            } else {
              orderPollingService.setAlertActive(true);
              const isRinging = await orderPollingService.isRinging();
              if (!isRinging) {
                orderPollingService.startRinging().catch(() => {});
              }
              setPendingOrder(incomingPending);
              setPendingTimeLeft(remainSec);
              onSwitchToDashboard?.();
            }
          }
        }
      }

      // Automatically refresh dashboard data to keep tasks and stats current without page refresh
      await loadDashboardData();
    } catch (err: any) {
      console.warn('[DashboardScreen] Error during 25s poll:', err?.message);
    }
  }, [isOnDuty, getCoordinates, getAgentPhone, getAgentId, handleAutoDecline, loadDashboardData, onSwitchToDashboard]);

  // Setup 25-second polling interval & listen to background polling service events
  useEffect(() => {
    // Check if an order was delivered via push notification click before listeners mounted
    orderPollingService.getLatestPendingOrder().then(async latestPending => {
      if (
        latestPending &&
        !declinedOrderIdsRef.current.has(latestPending._id || '') &&
        !declinedOrderIdsRef.current.has(latestPending.orderId || '')
      ) {
        const createdMs = latestPending.createdAt
          ? new Date(latestPending.createdAt).getTime()
          : Date.now();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
        const remainSec = elapsedSec < 300 ? 300 - elapsedSec : 0;
        if (remainSec > 0) {
          orderPollingService.setAlertActive(true);
          const isRinging = await orderPollingService.isRinging();
          if (!isRinging) {
            orderPollingService.startRinging().catch(() => {});
          }
          setPendingOrder(latestPending);
          setPendingTimeLeft(remainSec);
          onSwitchToDashboard?.();
        }
      }
      loadDashboardData().catch(() => {});
    });

    // Listen to incoming orders from native background service or foreground poll
    const unsubscribePending = orderPollingService.subscribeToPendingOrders(async incomingPending => {
      const incomingKey = incomingPending._id || incomingPending.orderId;
      const currentKey = pendingOrderRef.current ? pendingOrderRef.current._id || pendingOrderRef.current.orderId : null;

      if (
        declinedOrderIdsRef.current.has(incomingKey || '') ||
        (incomingPending._id && declinedOrderIdsRef.current.has(incomingPending._id)) ||
        (incomingPending.orderId && declinedOrderIdsRef.current.has(incomingPending.orderId))
      ) {
        return;
      }

      if (incomingKey !== currentKey) {
        const createdMs = incomingPending.createdAt
          ? new Date(incomingPending.createdAt).getTime()
          : Date.now();
        const elapsedSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
        const remainSec = elapsedSec < 300 ? 300 - elapsedSec : 0;

        if (remainSec <= 0) {
          await handleAutoDecline(incomingPending);
        } else {
          orderPollingService.setAlertActive(true);
          const isRinging = await orderPollingService.isRinging();
          if (!isRinging) {
            orderPollingService.startRinging().catch(() => {});
          }
          setPendingOrder(incomingPending);
          setPendingTimeLeft(remainSec);
          onSwitchToDashboard?.();
        }
      }
      loadDashboardData().catch(() => {});
    });

    const unsubscribePoll = orderPollingService.subscribeToPollResponses(() => {
      loadDashboardData().catch(() => {});
    });

    const unsubscribeAccepted = orderPollingService.subscribeToAcceptedAction(orderId => {
      console.log('[DashboardScreen] Order accepted via notification action:', orderId);
      orderPollingService.stopRinging().catch(() => {});
      orderPollingService.clearLatestPendingOrder().catch(() => {});
      orderPollingService.setAlertActive(false);
      setPendingOrder(null);
      pendingOrderRef.current = null;
      setPendingTimeLeft(300);
      if (Date.now() - lastAcceptedToastTimeRef.current > 4000) {
        lastAcceptedToastTimeRef.current = Date.now();
        if (Platform.OS === 'android') {
          ToastAndroid.show('Order accepted! En route to site.', ToastAndroid.SHORT);
        }
      }
      loadDashboardData().catch(() => {});
    });

    const unsubscribeDeclined = orderPollingService.subscribeToDeclinedAction(orderId => {
      console.log('[DashboardScreen] Order declined via notification action:', orderId);
      if (orderId) {
        declinedOrderIdsRef.current.add(orderId);
        orderPollingService.markOrderDeclined(orderId);
      }
      orderPollingService.stopRinging().catch(() => {});
      orderPollingService.clearLatestPendingOrder().catch(() => {});
      orderPollingService.setAlertActive(false);
      setPendingOrder(null);
      pendingOrderRef.current = null;
      setPendingTimeLeft(300);
      loadDashboardData().catch(() => {});
    });

    pollNewOrders();
    const pollInterval = setInterval(() => {
      pollNewOrders();
    }, 25000);

    return () => {
      clearInterval(pollInterval);
      unsubscribePending();
      unsubscribePoll();
      unsubscribeAccepted();
      unsubscribeDeclined();
    };
  }, [pollNewOrders, handleAutoDecline, loadDashboardData]);

  // 1-second Countdown Timer for Pending Order (5 Minutes)
  useEffect(() => {
    if (!pendingOrder || pendingTimeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setPendingTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoDecline(pendingOrder);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingOrder, pendingTimeLeft, handleAutoDecline]);

  // Accept Pending Order (within 5 minutes) -> sets status to 'In Transit'
  const handleAcceptPending = async (orderParam?: BackendOrder | any) => {
    if (isAcceptingInProgressRef.current) return;
    const isOrderObj =
      orderParam &&
      typeof orderParam === 'object' &&
      ('_id' in orderParam || 'orderId' in orderParam);
    const orderToAccept =
      (isOrderObj ? (orderParam as BackendOrder) : null) ||
      pendingOrderRef.current ||
      pendingOrder;
    if (!orderToAccept) return;

    isAcceptingInProgressRef.current = true;
    setOrderAccepting(true);

    const orderKey = orderToAccept._id || orderToAccept.orderId;

    // Immediately stop audio & dismiss modal optimistically so UI never freezes
    orderPollingService.stopRinging().catch(() => {});
    orderPollingService.clearLatestPendingOrder().catch(() => {});
    orderPollingService.setAlertActive(false);
    setPendingOrder(null);
    pendingOrderRef.current = null;
    setPendingTimeLeft(0);

    // Only show Toast once within 4 seconds (prevent duplicate / multi-trigger toast)
    if (Date.now() - lastAcceptedToastTimeRef.current > 4000) {
      lastAcceptedToastTimeRef.current = Date.now();
      if (Platform.OS === 'android') {
        ToastAndroid.show('Order accepted! En route to site.', ToastAndroid.SHORT);
      }
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Accept order timeout')), 10000)
      );
      await Promise.race([
        orderService.updateOrderStatus(orderKey, {
          status: 'In Transit',
        }),
        timeoutPromise,
      ]);
    } catch (err: any) {
      console.warn('[DashboardScreen] Error accepting order:', err?.message);
    } finally {
      setOrderAccepting(false);
      isAcceptingInProgressRef.current = false;
      loadDashboardData().catch(() => {});
    }
  };

  // Decline Pending Order manually
  const handleDeclinePending = async (declinedOrder?: BackendOrder | any) => {
    const isOrderObj =
      declinedOrder &&
      typeof declinedOrder === 'object' &&
      ('_id' in declinedOrder || 'orderId' in declinedOrder);
    const orderToDecline =
      (isOrderObj ? (declinedOrder as BackendOrder) : null) ||
      pendingOrderRef.current ||
      pendingOrder;
    if (!orderToDecline) {
      console.warn('[DashboardScreen] Decline tapped but no pending order found in state or param');
      return;
    }
    const orderKey = orderToDecline._id || orderToDecline.orderId || '';
    const mongoId = orderToDecline._id || '';
    const humanOrderId = orderToDecline.orderId || '';

    console.log('[DashboardScreen] Declining order:', { orderKey, mongoId, humanOrderId });

    // 1. Immediately record as declined in local ref & notify polling service to ignore forever
    if (orderKey) declinedOrderIdsRef.current.add(orderKey);
    if (mongoId) declinedOrderIdsRef.current.add(mongoId);
    if (humanOrderId) declinedOrderIdsRef.current.add(humanOrderId);

    orderPollingService.markOrderDeclined(orderKey, humanOrderId, mongoId);

    // 2. Immediately stop audio & dismiss modal optimistically so UI never freezes
    orderPollingService.stopRinging().catch(() => {});
    orderPollingService.clearLatestPendingOrder().catch(() => {});
    orderPollingService.setAlertActive(false);
    setPendingOrder(null);
    pendingOrderRef.current = null;
    setPendingTimeLeft(0);
    setOrderDeclining(false);

    if (Platform.OS === 'android') {
      ToastAndroid.show('Order declined.', ToastAndroid.SHORT);
    }

    const declinePayload = {
      status: 'Canceled',
      reason: 'Declined by agent',
      canceledBy: 'Agent',
      cancellationReason: 'Declined by agent',
      markedBy: 'Agent',
      role: 'Agent',
    };

    // 3. Trigger native background update thread (failsafe)
    if (orderKey) {
      orderPollingService.updateOrderStatusInBackground(orderKey, 'Canceled', 'Declined by agent');
    }
    if (humanOrderId && humanOrderId !== orderKey) {
      orderPollingService.updateOrderStatusInBackground(humanOrderId, 'Canceled', 'Declined by agent');
    }

    // 4. Send API cancel requests with retry and fallback over primary and alternate keys
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Decline order timeout')), 10000)
      );

      const updateTask = async () => {
        let success = false;
        if (orderKey) {
          try {
            const res = await orderService.updateOrderStatus(orderKey, declinePayload);
            if (res && (res.success || res.status === 'Canceled')) success = true;
          } catch {}
        }
        if (!success && humanOrderId && humanOrderId !== orderKey) {
          try {
            const res = await orderService.updateOrderStatus(humanOrderId, declinePayload);
            if (res && (res.success || res.status === 'Canceled')) success = true;
          } catch {}
        }
        if (!success && mongoId && mongoId !== orderKey) {
          try {
            const res = await orderService.updateOrderStatus(mongoId, declinePayload);
            if (res && (res.success || res.status === 'Canceled')) success = true;
          } catch {}
        }
        if (!success) {
          const directTarget = orderKey || humanOrderId || mongoId;
          if (directTarget) {
            await apiClient.put(`/orders/${directTarget}/status`, declinePayload).catch(() => {});
          }
        }
      };

      await Promise.race([updateTask(), timeoutPromise]);
    } catch (err: any) {
      console.warn('[DashboardScreen] Error declining order:', err?.message);
    } finally {
      loadDashboardData().catch(() => {});
    }
  };

  // Update In-Progress Task Status (e.g. In Transit -> In Progress, or In Progress -> Done)
  const handleUpdateInProgressStatus = async (
    order: BackendOrder,
    newStatus: 'In Progress' | 'Done'
  ) => {
    const orderKey = order._id || order.orderId;
    setUpdatingOrderId(orderKey);

    try {
      await orderService.updateOrderStatus(orderKey, {
        status: newStatus,
      });
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          newStatus === 'In Progress'
            ? 'Task started! Status: In Progress'
            : 'Task marked as Completed!',
          ToastAndroid.SHORT
        );
      }
      await loadDashboardData();
    } catch (err) {
      console.warn('[DashboardScreen] Could not update task status:', err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Call customer dialer
  const handleCallCustomer = (phone?: string) => {
    if (!phone) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Customer phone not provided', ToastAndroid.SHORT);
      }
      return;
    }
    const cleanNumber = phone.replace(/[^+\d]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Unable to open phone dialer', ToastAndroid.SHORT);
      }
    });
  };

  // Directions in Maps
  const handleOpenDirections = (order: BackendOrder) => {
    const lat = order.location?.latitude;
    const lng = order.location?.longitude;
    const addr =
      order.location?.address ||
      [order.location?.flat, order.location?.street, order.location?.cluster, order.location?.city]
        .filter(Boolean)
        .join(', ');

    let url = '';
    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else if (addr) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    }

    if (url) {
      Linking.openURL(url).catch(() => {
        if (Platform.OS === 'android') {
          ToastAndroid.show('Unable to open Google Maps', ToastAndroid.SHORT);
        }
      });
    }
  };

  // Pull-down refresh with 30s cooldown
  const REFRESH_COOLDOWN_MS = 15 * 1000;
  const lastRefreshTimeRef = useRef<number>(0);

  const handleRefresh = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRefreshTimeRef.current;
    if (timeSinceLast < REFRESH_COOLDOWN_MS && lastRefreshTimeRef.current !== 0) {
      const remainingSec = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLast) / 1000);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          `Please wait ${remainingSec}s before refreshing again`,
          ToastAndroid.SHORT
        );
      }
      setRefreshing(false);
      return;
    }

    lastRefreshTimeRef.current = now;
    setRefreshing(true);
    try {
      await pollNewOrders();
      await loadDashboardData();
    } finally {
      setRefreshing(false);
    }
  };

  // Format countdown mm:ss
  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const isPendingExpired = pendingTimeLeft <= 0;

  return (
    <>
      <ScrollView
        style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.colorPrimary]}
          tintColor={colors.colorPrimary}
        />
      }>
      {/* 1. Real-time Incoming Pending Order Alert with 5-Minute Timer */}
      {pendingOrder && (
        <View style={styles.pendingOrderCard}>
          {/* Header Row: Countdown and Cluster */}
          <View style={styles.orderHeaderRow}>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownIcon}>⏱</Text>
              <Text style={styles.countdownText}>
                {isPendingExpired
                  ? 'Expired (Auto-Declining...)'
                  : `${formatCountdown(pendingTimeLeft)} remaining`}
              </Text>
            </View>

            <View style={styles.distanceBadge}>
              <Text style={styles.distanceIcon}>📍</Text>
              <Text style={styles.distanceText}>
                {pendingOrder.location?.cluster ||
                  pendingOrder.location?.city ||
                  'Assigned Cluster'}
              </Text>
            </View>
          </View>

          {/* Job Details */}
          <View style={styles.jobDetailsRow}>
            <View style={styles.jobIconBox}>
              <Text style={styles.jobCategoryGlyph}>⚡</Text>
            </View>

            <View style={styles.jobMeta}>
              <View style={styles.jobPriceRow}>
                <Text style={styles.pendingJobTag}>NEW DISPATCH</Text>
                <Text style={styles.jobPrice}>₹{pendingOrder.totalPrice || 0}</Text>
              </View>
              <Text style={styles.jobTitle} numberOfLines={1}>
                {pendingOrder.taskTitle}
              </Text>
              <Text style={styles.jobLocation} numberOfLines={1}>
                {pendingOrder.location?.address ||
                  [
                    pendingOrder.location?.flat,
                    pendingOrder.location?.street,
                    pendingOrder.location?.cluster,
                    pendingOrder.location?.city,
                  ]
                    .filter(Boolean)
                    .join(', ') ||
                  'Society Site Location'}
              </Text>
            </View>
          </View>

          {/* Customer mini info */}
          {pendingOrder.customer && (
            <View style={styles.customerStrip}>
              <Text style={styles.customerNameText} numberOfLines={1}>
                👤 {pendingOrder.customer.name || 'Resident Customer'}
              </Text>
              {pendingOrder.customer.phone && (
                <Text style={styles.customerPhoneText}>
                  {pendingOrder.customer.phone}
                </Text>
              )}
            </View>
          )}

          {/* Actions: Decline & Accept */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleDeclinePending()}
              activeOpacity={0.8}
              disabled={isPendingExpired || orderDeclining || orderAccepting}>
              {orderDeclining ? (
                <ActivityIndicator size="small" color={colors.onSurface} />
              ) : (
                <Text style={styles.declineButtonText}>Decline</Text>
              )}
            </TouchableOpacity>

            <GradientButton
              style={[
                styles.acceptButton,
                isPendingExpired && styles.acceptButtonDisabled,
              ]}
              onPress={() => handleAcceptPending()}
              disabled={isPendingExpired || orderAccepting || orderDeclining}
              loading={orderAccepting}
              loadingText="Accepting..."
              icon={<Text style={styles.acceptIcon}>✓</Text>}
              title="Accept Order"
              textStyle={styles.acceptButtonText}
            />
          </View>
        </View>
      )}

      {/* 2. In-Progress Orders Section ("Show All Inprocess API card also as inprogresss") */}
      {inProgressOrders.length > 0 && (
        <View style={styles.inProgressSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionPulseDot}>🟢</Text>
              <Text style={styles.sectionTitle}>Active Tasks In Progress</Text>
            </View>
            <View style={styles.activeCountPill}>
              <Text style={styles.activeCountPillText}>
                {inProgressOrders.length} {inProgressOrders.length === 1 ? 'Job' : 'Jobs'}
              </Text>
            </View>
          </View>

          {inProgressOrders.map(order => {
            const isTransit = order.status === 'In Transit';
            const isUpdating = updatingOrderId === (order._id || order.orderId);
            const fullAddress =
              order.location?.address ||
              [
                order.location?.flat,
                order.location?.street,
                order.location?.cluster,
                order.location?.city,
              ]
                .filter(Boolean)
                .join(', ') ||
              'Assigned Customer Site';

            return (
              <View
                key={order._id || order.orderId}
                style={styles.inProgressCard}>
                {/* Status Badge & Order ID */}
                <View style={styles.inProgressHeader}>
                  <View
                    style={[
                      styles.inProgressStatusBadge,
                      isTransit
                        ? styles.badgeTransit
                        : styles.badgeInProgress,
                    ]}>
                    <Text style={styles.inProgressStatusIcon}>
                      {isTransit ? '🚲' : '⚡'}
                    </Text>
                    <Text style={styles.inProgressStatusText}>
                      {isTransit
                        ? 'In Transit • En Route'
                        : 'In Progress • On Site'}
                    </Text>
                  </View>

                  <Text style={styles.orderIdText}>
                    #{order.orderId || order._id.slice(-6).toUpperCase()}
                  </Text>
                </View>

                {/* Job Info */}
                <View style={styles.inProgressBody}>
                  <View style={styles.inProgressMainRow}>
                    <View style={styles.inProgressTitleCol}>
                      <Text style={styles.inProgressTaskTitle} numberOfLines={2}>
                        {order.taskTitle}
                      </Text>
                      {order.taskCategoryNames && order.taskCategoryNames.length > 0 && (
                        <Text style={styles.inProgressCategoryText}>
                          {order.taskCategoryNames.join(', ')}
                        </Text>
                      )}
                    </View>

                    <View style={styles.inProgressPriceCol}>
                      <Text style={styles.inProgressPriceText}>
                        ₹{order.totalPrice || 0}
                      </Text>
                      <Text style={styles.inProgressPaymentMethod}>
                        {order.paymentMethod || 'Prepaid / COD'}
                      </Text>
                    </View>
                  </View>

                  {/* Customer & Address Card Box */}
                  <View style={styles.customerInfoBox}>
                    <View style={styles.customerLine}>
                      <Text style={styles.customerIcon}>👤</Text>
                      <Text style={styles.customerNameValue} numberOfLines={1}>
                        {order.customer?.name || 'Resident Customer'}
                      </Text>
                      {order.customer?.phone && (
                        <TouchableOpacity
                          style={styles.miniCallBtn}
                          onPress={() => handleCallCustomer(order.customer?.phone)}
                          activeOpacity={0.7}>
                          <Text style={styles.miniCallBtnText}>📞 Call</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.addressLine}>
                      <Text style={styles.addressIcon}>📍</Text>
                      <Text style={styles.addressText} numberOfLines={2}>
                        {fullAddress}
                      </Text>
                      <TouchableOpacity
                        style={styles.miniMapBtn}
                        onPress={() => handleOpenDirections(order)}
                        activeOpacity={0.7}>
                        <Text style={styles.miniMapBtnText}>🗺️ Maps</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Action CTAs */}
                  <View style={styles.inProgressActionRow}>
                    {isTransit ? (
                      <TouchableOpacity
                        style={[
                          styles.advanceStatusButton,
                          isUpdating && styles.buttonDisabled,
                        ]}
                        onPress={() =>
                          handleUpdateInProgressStatus(order, 'In Progress')
                        }
                        disabled={isUpdating}
                        activeOpacity={0.85}>
                        {isUpdating ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <>
                            <Text style={styles.advanceButtonIcon}>📍</Text>
                            <Text style={styles.advanceButtonText}>
                              Reached Site • Start Job
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.completeTaskButton,
                          isUpdating && styles.buttonDisabled,
                        ]}
                        onPress={() =>
                          handleUpdateInProgressStatus(order, 'Done')
                        }
                        disabled={isUpdating}
                        activeOpacity={0.85}>
                        {isUpdating ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <>
                            <Text style={styles.advanceButtonIcon}>✓</Text>
                            <Text style={styles.completeButtonText}>
                              Complete Task
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    {order.customer?.phone && (
                      <TouchableOpacity
                        style={styles.secondaryCallButton}
                        onPress={() => handleCallCustomer(order.customer?.phone)}
                        activeOpacity={0.8}>
                        <Text style={styles.secondaryCallButtonText}>📞 Call</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 3. Standby Card if neither pending order nor in-progress orders */}
      {!pendingOrder && inProgressOrders.length === 0 && (
        <View style={styles.standbyCard}>
          <View style={styles.standbyIconContainer}>
            <Text style={styles.standbyIcon}>⚡</Text>
          </View>
          <View style={styles.standbyTextColumn}>
            <Text style={styles.standbyTitle}>Duty Active • Ready for Tasks</Text>
            <Text style={styles.standbySubtitle}>
              Polling live society dispatches every 30 seconds. New incoming tasks will appear here in real-time.
            </Text>
          </View>
        </View>
      )}

      {/* 4. Quick Duty Performance Ribbon: Today's Visits, On-Time Gate, Weekly Earn */}
      <View style={styles.metricsRibbonRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Today's Visits</Text>
          <Text style={[styles.metricValue, { color: colors.primary }]}>
            {todayVisitsText}
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>On-Time Gate</Text>
          <Text style={[styles.metricValue, { color: colors.tertiary }]}>
            {onTimeGateText}
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Weekly Earn</Text>
          <Text style={[styles.metricValue, { color: colors.secondary }]}>
            {weeklyEarnText}
          </Text>
        </View>
      </View>

      {/* 5. Key Metrics & Performance Bento Grid */}
      <View style={styles.bentoGrid}>
        {/* Today's Total */}
        <View style={styles.bentoCard}>
          <View style={styles.bentoHeader}>
            <Text style={styles.bentoTitle}>Today's Total</Text>
            <View style={styles.bentoIconBadgePrimary}>
              <Text style={styles.bentoIconGlyph}>👛</Text>
            </View>
          </View>

          <View style={styles.bentoMiddle}>
            <Text style={styles.metricBig}>{todayTotalEarnings}</Text>
            <View style={styles.metricSubRow}>
              <Text style={styles.trendIcon}>↗</Text>
              <Text style={styles.trendText}>{todayCompletedJobs}</Text>
            </View>
          </View>

          <View style={styles.bentoBottomPill}>
            <Text style={styles.pillLabel}>Month</Text>
            <Text style={styles.pillValue}>{monthTotalEarnings}</Text>
          </View>
        </View>

        {/* Rating & Completion */}
        <View style={styles.bentoCard}>
          <View style={styles.bentoHeader}>
            <Text style={styles.bentoTitle}>Performance</Text>
            <View style={styles.bentoIconBadgeSecondary}>
              <Text style={styles.bentoIconGlyph}>🎖️</Text>
            </View>
          </View>

          <View style={styles.bentoMiddle}>
            <View style={styles.ratingRow}>
              <Text style={styles.metricBig}>{performanceRating}</Text>
              {performanceRating !== '-' && (
                <Text style={styles.starGlyph}>★</Text>
              )}
            </View>
            <Text style={styles.quarterText}>{ordersQuarterCount}</Text>
          </View>

          <View style={styles.bentoBottomPill}>
            <Text style={styles.pillLabel}>Completion</Text>
            <Text style={[styles.pillValue, styles.completionHighlight]}>
              {completionRate}
            </Text>
          </View>
        </View>
      </View>

      {/* 6. Today's Activity Strip / Last Few Orders */}
      <View style={styles.activityCard}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Recent Orders</Text>
          <Text style={styles.activityShift}>Live Task Feed</Text>
        </View>

        <View style={styles.activityList}>
          {recentOrders.length > 0 ? (
            recentOrders.map(item => {
              const isDone = item.status === 'Done';
              const isTransit = item.status === 'In Transit';
              return (
                <View key={item._id || item.orderId} style={styles.activityItem}>
                  <View
                    style={[
                      styles.activityIconCircle,
                      isDone
                        ? styles.activityIconDone
                        : isTransit
                        ? styles.activityIconTransit
                        : styles.activityIconAlert,
                    ]}>
                    <Text style={styles.activityGlyph}>
                      {isDone ? '✓' : isTransit ? '🚲' : '⚡'}
                    </Text>
                  </View>
                  <View style={styles.activityContent}>
                    <View style={styles.activityRowTop}>
                      <Text style={styles.activityJobTitle} numberOfLines={1}>
                        {item.taskTitle}
                      </Text>
                      <Text
                        style={
                          isDone
                            ? styles.statusDone
                            : isTransit
                            ? styles.statusTransit
                            : styles.statusAlert
                        }>
                        {isDone ? `₹${item.totalPrice} Done` : item.status}
                      </Text>
                    </View>
                    <Text style={styles.activityJobSub} numberOfLines={1}>
                      {item.location?.address ||
                        item.location?.cluster ||
                        item.location?.city ||
                        'KWEEKO Society Hub'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyRecentCard}>
              <Text style={styles.emptyRecentTitle}>No Orders Yet</Text>
              <Text style={styles.emptyRecentSubtitle}>
                Tasks assigned to you will show up here as they are received.
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>

    {/* Full Screen Incoming Dispatch Alert Popup */}
    <IncomingDispatchModal
      visible={!!pendingOrder}
      order={pendingOrder}
      timeLeftSeconds={pendingTimeLeft}
      onAccept={handleAcceptPending}
      onDecline={handleDeclinePending}
      isAccepting={orderAccepting}
      isDeclining={orderDeclining}
    />
  </>
  );
}

          const styles = StyleSheet.create({
            container: {
            flex: 1,
          backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  pendingOrderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(53, 37, 205, 0.35)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  pendingJobTag: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  customerStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAF8FF',
    borderWidth: 1,
    borderColor: '#EAEDFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  customerNameText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: '#131B2E',
    flex: 1,
  },
  customerPhoneText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  inProgressSection: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionPulseDot: {
    fontSize: 10,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
  },
  activeCountPill: {
    backgroundColor: '#EEF0FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeCountPillText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  inProgressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAEDFF',
    padding: 16,
    shadowColor: 'rgba(53, 37, 205, 0.06)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  inProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inProgressStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 5,
  },
  badgeTransit: {
    backgroundColor: '#EEF0FF',
  },
  badgeInProgress: {
    backgroundColor: '#ECFDF5',
  },
  inProgressStatusIcon: {
    fontSize: 12,
  },
  inProgressStatusText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#131B2E',
  },
  orderIdText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  inProgressBody: {
    gap: 12,
  },
  inProgressMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  inProgressTitleCol: {
    flex: 1,
  },
  inProgressTaskTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: '#131B2E',
    lineHeight: 20,
  },
  inProgressCategoryText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  inProgressPriceCol: {
    alignItems: 'flex-end',
  },
  inProgressPriceText: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  inProgressPaymentMethod: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  customerInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 8,
  },
  customerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerIcon: {
    fontSize: 13,
  },
  customerNameValue: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  miniCallBtn: {
    backgroundColor: '#EEF0FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniCallBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  addressLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressIcon: {
    fontSize: 13,
    marginTop: 2,
  },
  addressText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  miniMapBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  miniMapBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  inProgressActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  advanceStatusButton: {
    flex: 2,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  completeTaskButton: {
    flex: 2,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#059669', // Emerald
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  advanceButtonIcon: {
    fontSize: 14,
    color: colors.white,
  },
  advanceButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  completeButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryCallButton: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCallButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  orderAlertCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 88, 65, 0.25)',
    shadowColor: colors.primaryContainer,
    shadowOffset: {width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
          cardDimmed: {
            opacity: 0.7,
  },
          orderHeaderRow: {
            flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
  },
          countdownBadge: {
            flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primaryFixed,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          gap: 5,
  },
          countdownIcon: {
            fontSize: 12,
  },
          countdownText: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: '700',
          color: colors.primary,
  },
          distanceBadge: {
            flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceContainer,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          gap: 4,
  },
          distanceIcon: {
            fontSize: 11,
  },
          distanceText: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: typography.weightSemibold,
          color: colors.onSurface,
  },
          jobDetailsRow: {
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
          },
          jobIconBox: {
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: colors.surfaceContainer,
            alignItems: 'center',
            justifyContent: 'center',
          },
          standbyCard: {
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#EAEDFF',
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            shadowColor: 'rgba(53, 37, 205, 0.05)',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 6,
            elevation: 2,
          },
          standbyIconContainer: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#EEF0FF',
            alignItems: 'center',
            justifyContent: 'center',
          },
          standbyIcon: {
            fontSize: 22,
          },
          standbyTextColumn: {
            flex: 1,
          },
          standbyTitle: {
            fontFamily: typography.fontFamily,
            fontSize: 14,
            fontWeight: '700',
            color: '#131B2E',
            marginBottom: 2,
          },
          standbySubtitle: {
            fontFamily: typography.fontFamily,
            fontSize: 12,
            color: '#64748B',
            lineHeight: 17,
          },
          emptyRecentCard: {
            paddingVertical: 24,
            alignItems: 'center',
            justifyContent: 'center',
          },
          emptyRecentTitle: {
            fontFamily: typography.fontFamily,
            fontSize: 14,
            fontWeight: '600',
            color: '#64748B',
            marginBottom: 4,
          },
          emptyRecentSubtitle: {
            fontFamily: typography.fontFamily,
            fontSize: 12,
            color: '#94A3B8',
            textAlign: 'center',
            paddingHorizontal: 20,
          },
          jobImageContainer: {
            width: 64,
          height: 64,
          borderRadius: 12,
          backgroundColor: colors.surfaceContainer,
          overflow: 'hidden',
          position: 'relative',
  },
          jobImage: {
            width: '100%',
          height: '100%',
  },
          jobCategoryBadge: {
            position: 'absolute',
          bottom: 0,
          right: 0,
          width: 22,
          height: 22,
          borderTopLeftRadius: 8,
          backgroundColor: colors.secondary,
          alignItems: 'center',
          justifyContent: 'center',
  },
          jobCategoryGlyph: {
            fontSize: 11,
          color: colors.white,
  },
          jobMeta: {
            flex: 1,
          justifyContent: 'center',
  },
          jobPriceRow: {
            flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 2,
  },
          jobTag: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          fontWeight: '700',
          color: colors.secondary,
          letterSpacing: 0.5,
  },
          jobPrice: {
            fontFamily: typography.fontFamily,
          fontSize: 17,
          fontWeight: typography.weightBold,
          color: colors.primary,
  },
          jobTitle: {
            fontFamily: typography.fontFamily,
          fontSize: 16,
          fontWeight: typography.weightBold,
          color: colors.onSurface,
  },
          jobLocation: {
            fontFamily: typography.fontFamily,
          fontSize: 13,
          color: colors.onSurfaceVariant,
          marginTop: 2,
  },
          payoutChip: {
            marginTop: 12,
          backgroundColor: colors.surfaceContainerLow,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
  },
          payoutLeft: {
            flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
  },
          payoutIcon: {
            fontSize: 14,
  },
          payoutText: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          color: colors.onSurfaceVariant,
  },
          surgeText: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: typography.weightBold,
          color: colors.primary,
  },
          microNoticeRow: {
            flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
  },
          boltIcon: {
            fontSize: 13,
          color: colors.primary,
  },
          microNoticeText: {
            flex: 1,
          fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.onSurfaceVariant,
          lineHeight: 16,
  },
          actionsRow: {
            flexDirection: 'row',
          gap: 8,
          marginTop: 14,
  },
          declineButton: {
            flex: 1,
            height: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.outlineVariant,
            backgroundColor: colors.surfaceContainerLow,
            alignItems: 'center',
            justifyContent: 'center',
          },
          declineButtonText: {
            fontFamily: typography.fontFamily,
            fontSize: 14,
            fontWeight: typography.weightSemibold,
            color: colors.onSurface,
          },
          acceptButton: {
            flex: 2,
            height: 44,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 3,
          },
          acceptButtonDisabled: {
            opacity: 0.5,
  },
          acceptIcon: {
            color: colors.white,
          fontSize: 14,
          fontWeight: '900',
  },
          acceptButtonText: {
            fontFamily: typography.fontFamily,
          fontSize: 14,
          fontWeight: typography.weightBold,
          color: colors.white,
  },
          lockedBanner: {
            marginTop: 14,
          height: 44,
          borderRadius: 10,
          backgroundColor: colors.tertiary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
  },
          lockedIcon: {
            color: colors.white,
          fontSize: 16,
          fontWeight: '900',
  },
          lockedText: {
            fontFamily: typography.fontFamily,
          fontSize: 13,
          fontWeight: typography.weightBold,
          color: colors.white,
  },
          declinedNoticeCard: {
            backgroundColor: colors.surfaceContainerLow,
          borderRadius: 14,
          padding: 16,
          alignItems: 'center',
          gap: 8,
  },
          declinedText: {
            fontFamily: typography.fontFamily,
          fontSize: 13,
          color: colors.onSurfaceVariant,
  },
          reopenButton: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
          },
          reopenButtonText: {
            fontFamily: typography.fontFamily,
            fontSize: 12,
            fontWeight: typography.weightSemibold,
            color: colors.white,
          },
          metricsRibbonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily,
    color: colors.onSurfaceVariant,
    marginBottom: 4,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 17,
    fontFamily: typography.fontFamily,
    fontWeight: '800',
  },
  bentoGrid: {
            flexDirection: 'row',
          gap: 12,
  },
          bentoCard: {
            flex: 1,
          backgroundColor: colors.surfaceContainerLowest,
          borderRadius: 16,
          padding: 14,
          shadowColor: colors.primary,
          shadowOffset: {width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 2,
          justifyContent: 'space-between',
          minHeight: 150,
  },
          bentoHeader: {
            flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
  },
          bentoTitle: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: typography.weightSemibold,
          color: colors.onSurfaceVariant,
  },
          bentoIconBadgePrimary: {
            width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.primaryFixed,
          alignItems: 'center',
          justifyContent: 'center',
  },
          bentoIconBadgeSecondary: {
            width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.secondaryFixed,
          alignItems: 'center',
          justifyContent: 'center',
  },
          bentoIconGlyph: {
            fontSize: 13,
  },
          bentoMiddle: {
            marginVertical: 6,
  },
          metricBig: {
            fontFamily: typography.fontFamily,
          fontSize: 24,
          fontWeight: typography.weightBold,
          color: colors.onSurface,
          letterSpacing: -0.5,
  },
          metricSubRow: {
            flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 2,
  },
          trendIcon: {
            fontSize: 12,
          color: colors.tertiary,
          fontWeight: '900',
  },
          trendText: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.tertiary,
          fontWeight: typography.weightSemibold,
  },
          ratingRow: {
            flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
  },
          starGlyph: {
            fontSize: 18,
          color: colors.star,
  },
          quarterText: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.onSurfaceVariant,
          marginTop: 2,
  },
          bentoBottomPill: {
            backgroundColor: colors.surfaceContainerLow,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderRadius: 6,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
  },
          pillLabel: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.onSurfaceVariant,
  },
          pillValue: {
            fontFamily: typography.fontFamily,
          fontSize: 12,
          fontWeight: typography.weightBold,
          color: colors.onSurface,
  },
          completionHighlight: {
            color: colors.tertiary,
  },
          activityCard: {
            backgroundColor: colors.surfaceContainerLowest,
          borderRadius: 16,
          padding: 16,
          shadowColor: colors.primary,
          shadowOffset: {width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 2,
  },
          activityHeader: {
            flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
  },
          activityTitle: {
            fontFamily: typography.fontFamily,
          fontSize: 15,
          fontWeight: typography.weightBold,
          color: colors.onSurface,
  },
          activityShift: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.onSurfaceVariant,
  },
          activityList: {
            gap: 12,
  },
          activityItem: {
            flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
  },
          activityIconCircle: {
            width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
  },
          activityIconTransit: {
            backgroundColor: colors.primaryFixed,
  },
          activityIconDone: {
            backgroundColor: colors.surfaceContainer,
  },
          activityIconAlert: {
            backgroundColor: colors.secondaryFixed,
  },
          activityGlyph: {
            fontSize: 12,
  },
          activityContent: {
            flex: 1,
  },
          activityRowTop: {
            flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
  },
          activityJobTitle: {
            fontFamily: typography.fontFamily,
          fontSize: 13,
          fontWeight: typography.weightSemibold,
          color: colors.onSurface,
          flex: 1,
  },
          statusTransit: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          fontWeight: typography.weightBold,
          color: colors.primary,
  },
          statusDone: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          fontWeight: typography.weightSemibold,
          color: colors.tertiary,
  },
          statusAlert: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          fontWeight: typography.weightBold,
          color: colors.secondary,
  },
          activityJobSub: {
            fontFamily: typography.fontFamily,
          fontSize: 11,
          color: colors.onSurfaceVariant,
          marginTop: 1,
  },
});

