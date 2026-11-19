import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GradientButton } from '../components/GradientButton';
import { orderService, type BackendOrder } from '../services/orderService';

const SAMPLE_JOB_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB3UnaoKNvL3iIspXKJoiLs3YCldwCiRK4yyt6pzR1AJbqHOfTirMZ1N2FJUYDOm413Hyg3CfK2fDVJLSyz9LSORxrP79aTU6O1XSqU91jeAAhGr8eA3J_L17wFYlMRu8FoZbftjpHOxdTrQdgRhhk17vgr5oYWIp_eNoankk4JYHhQhOm2yiPAWACxlNKwYXGsKNHH2OfNdebD4douMO2PZ96WI5CSuq2tqBR-170';

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
  } else {
    const anyDone = orders.filter(o => o.status === 'Done');
    visitsText = anyDone.length > 0 ? `${anyDone.length} Done` : '0 / 1';
  }

  // 2. On-Time Gate: reached time of completed order (prioritize today's completed, or recent completed)
  const targetCompleted =
    todayCompleted.length > 0
      ? todayCompleted[0]
      : orders.find(o => o.status === 'Done');

  let gateText = '98%';
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

    if (!reachedMins && targetCompleted.scheduledTimeSlot) {
      const match = targetCompleted.scheduledTimeSlot.match(
        /(\d+)\s*(?:min|mins|minutes)/i
      );
      if (match && match[1]) {
        reachedMins = parseInt(match[1], 10);
      }
    }

    if (reachedMins) {
      gateText = `${reachedMins} min`;
    } else {
      gateText = '15 min';
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

  // Fallback to all completed orders for this partner if none within the specific window
  if (weekTotal === 0) {
    const allCompleted = orders.filter(o => o.status === 'Done');
    for (const o of allCompleted) {
      const payout =
        o.agentPayment?.amount ||
        Math.round((o.totalPrice || 0) * 0.85) ||
        o.totalPrice ||
        0;
      weekTotal += payout;
    }
  }

  let earnText = `₹${weekTotal.toLocaleString('en-IN')}`;
  if (weekTotal >= 10000) {
    earnText = `₹${(weekTotal / 1000).toFixed(1)}k`;
  }

  return {
    visitsText,
    gateText,
    earnText,
  };
}

export function DashboardScreen({ user }: { user?: User } = {}) {
  const [timeLeft, setTimeLeft] = useState(38);
  const [orderState, setOrderState] = useState<'pending' | 'locking' | 'locked' | 'declined'>('pending');
  const [recentOrders, setRecentOrders] = useState<BackendOrder[]>([]);
  const [todayVisitsText, setTodayVisitsText] = useState('0 / 0');
  const [onTimeGateText, setOnTimeGateText] = useState('98%');
  const [weeklyEarnText, setWeeklyEarnText] = useState('₹0');

  useEffect(() => {
    const cleanPhone = (user?.phoneNumber || '8800313434').replace(/\D/g, '').slice(-10);
    const agentId = cleanPhone || user?.email || user?.uid || '';

    orderService
      .getOrders({ agentId: agentId || undefined, limit: 50 })
      .then(res => {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          setRecentOrders(res.data.slice(0, 4));
          const metrics = calculateDashboardMetrics(res.data);
          setTodayVisitsText(metrics.visitsText);
          setOnTimeGateText(metrics.gateText);
          setWeeklyEarnText(metrics.earnText);
        } else {
          // If 0 returned for agentId filter, fetch without filter and resolve user orders
          orderService
            .getOrders({ limit: 50 })
            .then(allRes => {
              if (allRes && allRes.success && Array.isArray(allRes.data)) {
                const userOrders = allRes.data.filter(
                  o =>
                    (cleanPhone &&
                      (o.agentPhone?.includes(cleanPhone) ||
                        o.agentId?.includes(cleanPhone))) ||
                    (user?.email &&
                      (o.agentId?.includes(user.email) ||
                        o.customer?.email === user.email)) ||
                    (o.agentName &&
                      user?.displayName &&
                      o.agentName.toLowerCase() ===
                        user.displayName.toLowerCase())
                );
                const listToUse = userOrders.length > 0 ? userOrders : allRes.data;
                setRecentOrders(listToUse.slice(0, 4));
                const metrics = calculateDashboardMetrics(listToUse);
                setTodayVisitsText(metrics.visitsText);
                setOnTimeGateText(metrics.gateText);
                setWeeklyEarnText(metrics.earnText);
              }
            })
            .catch(() => {});
        }
      })
      .catch(err => {
        console.warn('[DashboardScreen] Could not load live orders:', err?.message);
      });
  }, [user]);

  useEffect(() => {
    if (orderState !== 'pending' || timeLeft <= 0) {
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [orderState, timeLeft]);

  const handleAccept = () => {
    setOrderState('locking');
    setTimeout(() => {
      setOrderState('locked');
    }, 700);
  };

  const handleDecline = () => {
    setOrderState('declined');
  };

  const handleResetOrder = () => {
    setTimeLeft(38);
    setOrderState('pending');
  };

  const isExpired = timeLeft === 0 && orderState === 'pending';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      {/* Real-time Incoming Order Alert (Bento Focal Item) */}
      {orderState !== 'declined' ? (
        <View
          style={[
            styles.orderAlertCard,
            (isExpired || orderState === 'locked') && styles.cardDimmed,
          ]}>
          {/* Header with Countdown and Distance */}
          <View style={styles.orderHeaderRow}>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownIcon}>⏱</Text>
              <Text style={styles.countdownText}>
                {isExpired
                  ? 'Expired'
                  : `00:${timeLeft < 10 ? '0' : ''}${timeLeft} remaining`}
              </Text>
            </View>

            <View style={styles.distanceBadge}>
              <Text style={styles.distanceIcon}>📍</Text>
              <Text style={styles.distanceText}>1.2 km away</Text>
            </View>
          </View>

          {/* Job Details & Image */}
          <View style={styles.jobDetailsRow}>
            <View style={styles.jobImageContainer}>
              <Image
                source={{ uri: SAMPLE_JOB_IMAGE }}
                style={styles.jobImage}
                resizeMode="cover"
              />
              <View style={styles.jobCategoryBadge}>
                <Text style={styles.jobCategoryGlyph}>🔧</Text>
              </View>
            </View>

            <View style={styles.jobMeta}>
              <View style={styles.jobPriceRow}>
                <Text style={styles.jobTag}>INSTANT DISPATCH</Text>
                <Text style={styles.jobPrice}>₹450</Text>
              </View>
              <Text style={styles.jobTitle} numberOfLines={1}>
                Kitchen Pipe Leakage
              </Text>
              <Text style={styles.jobLocation} numberOfLines={1}>
                Tower B, Flat 804 • Palm Heights
              </Text>
            </View>
          </View>

          {/* Payout Details Chip */}
          <View style={styles.payoutChip}>
            <View style={styles.payoutLeft}>
              <Text style={styles.payoutIcon}>💰</Text>
              <Text style={styles.payoutText}>Eligible for Resident Tip</Text>
            </View>
            <Text style={styles.surgeText}>+₹50 Surge Added</Text>
          </View>

          {/* Micro Notice */}
          <View style={styles.microNoticeRow}>
            <Text style={styles.boltIcon}>⚡</Text>
            <Text style={styles.microNoticeText}>
              First agent to accept locks this job instantly across the society hub.
            </Text>
          </View>

          {/* Action Buttons */}
          {orderState === 'locked' ? (
            <View style={styles.lockedBanner}>
              <Text style={styles.lockedIcon}>✓</Text>
              <Text style={styles.lockedText}>
                Order Locked • Navigating to Palm Heights
              </Text>
            </View>
          ) : (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                activeOpacity={0.8}
                disabled={isExpired}>
                <Text style={styles.declineButtonText}>Decline</Text>
              </TouchableOpacity>

              <GradientButton
                style={[styles.acceptButton, isExpired && styles.acceptButtonDisabled]}
                onPress={handleAccept}
                disabled={isExpired || orderState === 'locking'}
                loading={orderState === 'locking'}
                loadingText="Locking Job..."
                icon={<Text style={styles.acceptIcon}>✓</Text>}
                title="Accept Order"
                textStyle={styles.acceptButtonText}
              />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.declinedNoticeCard}>
          <Text style={styles.declinedText}>Order dismissed. Listening for nearby tasks...</Text>
          <GradientButton
            onPress={handleResetOrder}
            style={styles.reopenButton}
            title="Simulate New Job"
            textStyle={styles.reopenButtonText}
          />
        </View>
      )}

      {/* Quick Duty Performance Ribbon: Today's Visits, On-Time Gate, Weekly Earn */}
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

      {/* Key Metrics & Performance Bento Grid */}
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
            <Text style={styles.metricBig}>₹1,280</Text>
            <View style={styles.metricSubRow}>
              <Text style={styles.trendIcon}>↗</Text>
              <Text style={styles.trendText}>4 completed jobs</Text>
            </View>
          </View>

          <View style={styles.bentoBottomPill}>
            <Text style={styles.pillLabel}>Month</Text>
            <Text style={styles.pillValue}>₹18,450</Text>
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
              <Text style={styles.metricBig}>4.9</Text>
              <Text style={styles.starGlyph}>★</Text>
            </View>
            <Text style={styles.quarterText}>142 Orders this quarter</Text>
          </View>

          <View style={styles.bentoBottomPill}>
            <Text style={styles.pillLabel}>Completion</Text>
            <Text style={[styles.pillValue, styles.completionHighlight]}>
              98.6%
            </Text>
          </View>
        </View>
      </View>

      {/* Today's Activity Strip / Last Few Orders */}
      <View style={styles.activityCard}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Last Few Orders</Text>
          <Text style={styles.activityShift}>Shift: 08:30 - Present</Text>
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
                            {item.location?.address || item.location?.cluster || 'KWEEKO Society Hub'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <>
                    {/* Order 1: Active In Transit */}
                    <View style={styles.activityItem}>
                      <View style={[styles.activityIconCircle, styles.activityIconTransit]}>
                        <Text style={styles.activityGlyph}>🚲</Text>
                      </View>
                      <View style={styles.activityContent}>
                        <View style={styles.activityRowTop}>
                          <Text style={styles.activityJobTitle}>Plumbing Tool Restock</Text>
                          <Text style={styles.statusTransit}>In Transit</Text>
                        </View>
                        <Text style={styles.activityJobSub}>KWEEKO Society Hub #4 • Sector 12</Text>
                      </View>
                    </View>

                    {/* Order 2: Completed */}
                    <View style={styles.activityItem}>
                      <View style={[styles.activityIconCircle, styles.activityIconDone]}>
                        <Text style={styles.activityGlyph}>✓</Text>
                      </View>
                      <View style={styles.activityContent}>
                        <View style={styles.activityRowTop}>
                          <Text style={styles.activityJobTitle}>
                            Bathroom Tap Seal Replacement
                          </Text>
                          <Text style={styles.statusDone}>₹380 Done</Text>
                        </View>
                        <Text style={styles.activityJobSub}>
                          Tower A, Flat 301 • Completed 11:15 AM
                        </Text>
                      </View>
                    </View>

                      {/* Order 3: Completed */}
                      <View style={styles.activityItem}>
                        <View style={[styles.activityIconCircle, styles.activityIconDone]}>
                          <Text style={styles.activityGlyph}>✓</Text>
                        </View>
                        <View style={styles.activityContent}>
                          <View style={styles.activityRowTop}>
                            <Text style={styles.activityJobTitle}>Main Valve Inspection</Text>
                            <Text style={styles.statusDone}>₹450 Done</Text>
                          </View>
                          <Text style={styles.activityJobSub}>
                            Villa 18 • Completed 09:40 AM
                          </Text>
                        </View>
                      </View>
                </>
          )}
              </View>
            </View>
          </ScrollView>
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

