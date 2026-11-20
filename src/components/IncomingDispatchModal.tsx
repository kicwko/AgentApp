import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BackendOrder } from '../services/orderService';

let LinearGradient: any = View;
try {
  const mod = require('react-native-linear-gradient');
  LinearGradient = mod?.default || mod || View;
} catch {
  LinearGradient = View;
}

interface IncomingDispatchModalProps {
  visible: boolean;
  order: BackendOrder | null;
  timeLeftSeconds: number;
  onAccept: () => Promise<void> | void;
  onDecline: () => Promise<void> | void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function IncomingDispatchModal({
  visible,
  order,
  timeLeftSeconds,
  onAccept,
  onDecline,
  isAccepting = false,
  isDeclining = false,
}: IncomingDispatchModalProps) {
  let insets = { top: 24, bottom: 16, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    insets = useSafeAreaInsets() || insets;
  } catch {
    insets = { top: 24, bottom: 16, left: 0, right: 0 };
  }
  const [showAcceptedSuccess, setShowAcceptedSuccess] = useState(false);

  // Animations for Radar Ripple & Call Pulse
  const rippleAnim1 = useRef(new Animated.Value(0)).current;
  const rippleAnim2 = useRef(new Animated.Value(0)).current;
  const acceptPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      setShowAcceptedSuccess(false);
      return;
    }

    // Ripple 1
    const anim1 = Animated.loop(
      Animated.timing(rippleAnim1, {
        toValue: 1,
        duration: 2600,
        useNativeDriver: true,
      })
    );
    // Ripple 2 (staggered delay)
    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(rippleAnim2, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    // Accept Button Pulse
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(acceptPulseAnim, {
          toValue: 1.14,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(acceptPulseAnim, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    anim1.start();
    anim2.start();
    pulseAnim.start();

    return () => {
      anim1.stop();
      anim2.stop();
      pulseAnim.stop();
      rippleAnim1.setValue(0);
      rippleAnim2.setValue(0);
      acceptPulseAnim.setValue(1);
    };
  }, [visible, rippleAnim1, rippleAnim2, acceptPulseAnim]);

  if (!visible || !order) {
    return null;
  }

  // Format countdown mm:ss
  const mins = Math.floor(Math.max(0, timeLeftSeconds) / 60);
  const secs = Math.max(0, timeLeftSeconds) % 60;
  const timeFormatted = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

  // Job Meta
  const taskTitle = order.taskTitle || 'Kitchen Pipe Leakage';
  const categoryTag =
    (order as any).serviceCategory ||
    (order as any).serviceTitle ||
    (order as any).subCategory ||
    (order as any).category ||
    'Plumbing & Leakage';

  const locationText =
    order.location?.address ||
    [
      order.location?.flat,
      order.location?.street,
      order.location?.cluster,
      order.location?.city,
    ]
      .filter(Boolean)
      .join(', ') ||
    'Tower B, Flat 804 • Palm Heights';

  const payout =
    order.agentPayment?.amount ||
    Math.round((order.totalPrice || 0) * 0.85) ||
    order.totalPrice ||
    450;

  // Category Icon picker
  const getCategoryGlyph = (cat: string) => {
    const lower = cat.toLowerCase();
    if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('leak')) return '🔧';
    if (lower.includes('elect') || lower.includes('wire') || lower.includes('light')) return '⚡';
    if (lower.includes('clean') || lower.includes('maid')) return '✨';
    if (lower.includes('paint')) return '🎨';
    if (lower.includes('carpenter') || lower.includes('wood')) return '🪚';
    return '🛠️';
  };

  const handlePressAccept = async () => {
    try {
      Vibration.vibrate([0, 100, 60, 100]);
    } catch {}
    setShowAcceptedSuccess(true);
  };

  const handleConfirmStartNavigation = async () => {
    setShowAcceptedSuccess(false);
    await onAccept();
  };

  const handlePressDecline = async () => {
    try {
      Vibration.vibrate(50);
    } catch {}
    await onDecline();
  };

  // Interpolations for Ripple 1 & 2
  const rippleScale1 = rippleAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 2.3],
  });
  const rippleOpacity1 = rippleAnim1.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.6, 0.35, 0],
  });

  const rippleScale2 = rippleAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 2.3],
  });
  const rippleOpacity2 = rippleAnim2.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.6, 0.35, 0],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onDecline}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#f8fafc', '#f1f5f9', '#e8edf5']}
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 24) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}>
        {/* Soft Ambient Background Glows */}
        <View style={styles.ambientGlowTop} pointerEvents="none" />
        <View style={styles.ambientGlowBottom} pointerEvents="none" />

        {/* 1. Top Dispatch Status & Timer Pill */}
        <View style={styles.topSection}>
          {/* Animated Status Badge */}
          <View style={styles.statusPill}>
            <View style={styles.dotContainer}>
              <View style={styles.dotPing} />
              <View style={styles.dotCore} />
            </View>
            <Text style={styles.statusText}>INSTANT DISPATCH</Text>
          </View>

          {/* Countdown Timer Pill */}
          <View style={styles.timerPill}>
            <Text style={styles.timerClockIcon}>⏱</Text>
            <Text style={styles.timerText}>Auto-rejects in {timeFormatted}</Text>
          </View>
        </View>

        {/* 2. Center Call Avatar & Caller Info Section */}
        <View style={styles.centerSection}>
          {/* Pulsing Incoming Call Radar Wave Container */}
          <View style={styles.radarWrapper}>
            <Animated.View
              style={[
                styles.rippleRing,
                styles.rippleIndigo,
                {
                  transform: [{ scale: rippleScale1 }],
                  opacity: rippleOpacity1,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.rippleRing,
                styles.rippleTeal,
                {
                  transform: [{ scale: rippleScale2 }],
                  opacity: rippleOpacity2,
                },
              ]}
            />

            {/* Glowing Central Emblem */}
            <LinearGradient
              colors={['#4f46e5', '#6366f1', '#00C49F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emblemBorder}>
              <View style={styles.emblemCore}>
                <Text style={styles.emblemGlyph}>{getCategoryGlyph(categoryTag)}</Text>
              </View>
            </LinearGradient>

            {/* Bolt Badge */}
            <LinearGradient
              colors={['#00C49F', '#00B894']}
              style={styles.boltBadge}>
              <Text style={styles.boltIcon}>⚡</Text>
            </LinearGradient>
          </View>

          {/* Category Tag */}
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{categoryTag}</Text>
          </View>

          {/* Job Title */}
          <Text style={styles.jobTitleText} numberOfLines={2}>
            {taskTitle}
          </Text>

          {/* Location & Distance */}
          <View style={styles.locationRow}>
            <Text style={styles.locationPinIcon}>📍</Text>
            <Text style={styles.locationMainText} numberOfLines={1}>
              {locationText}
            </Text>
            <Text style={styles.locationDot}>•</Text>
            <Text style={styles.distanceText}>1.2 km away</Text>
          </View>

          {/* Payout Card Highlight */}
          <View style={styles.payoutCard}>
            <Text style={styles.payoutLabel}>ESTIMATED NET PAYOUT</Text>
            <Text style={styles.payoutAmount}>₹{payout}</Text>
          </View>
        </View>

        {/* 3. Bottom Action Controls (Phone Call Style) */}
        <View style={styles.bottomSection}>
          <View style={styles.callButtonsRow}>
            {/* Decline / Reject Button */}
            <View style={styles.callBtnColumn}>
              <TouchableOpacity
                onPress={handlePressDecline}
                activeOpacity={0.85}
                disabled={isDeclining || isAccepting}
                style={styles.declineCircle}>
                {isDeclining ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.declineCallIcon}>✕</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.declineLabel}>DECLINE</Text>
            </View>

            {/* Accept Button (Pulsing Call Style) */}
            <View style={styles.callBtnColumn}>
              <View style={styles.acceptButtonWrapper}>
                <Animated.View
                  style={[
                    styles.acceptPulseRing,
                    {
                      transform: [{ scale: acceptPulseAnim }],
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={handlePressAccept}
                  activeOpacity={0.85}
                  disabled={isAccepting || isDeclining}
                  style={styles.acceptCircle}>
                  {isAccepting ? (
                    <ActivityIndicator size="small" color="#032B25" />
                  ) : (
                    <Text style={styles.acceptCallIcon}>📞</Text>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.acceptLabel}>ACCEPT</Text>
            </View>
          </View>

          {/* Subtitle helper text at bottom */}
          <Text style={styles.helperSubtitle}>
            Tap Accept to lock request & launch turn-by-turn route
          </Text>
        </View>

        {/* 4. Accepted Feedback Overlay Modal */}
        {showAcceptedSuccess && (
          <View style={styles.acceptedModalOverlay}>
            <View style={styles.acceptedModalCard}>
              <View style={styles.verifiedIconCircle}>
                <Text style={styles.verifiedGlyph}>✓</Text>
              </View>
              <Text style={styles.acceptedTitle}>Job Accepted!</Text>
              <Text style={styles.acceptedSubtitle}>
                Routing to {locationText}.
              </Text>

              <View style={styles.guaranteeBox}>
                <Text style={styles.guaranteeLabel}>Net Guarantee</Text>
                <Text style={styles.guaranteeAmount}>₹{payout}</Text>
              </View>

              <TouchableOpacity
                onPress={handleConfirmStartNavigation}
                activeOpacity={0.88}
                style={styles.startNavButton}>
                <Text style={styles.startNavText}>Start Navigation</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  ambientGlowTop: {
    position: 'absolute',
    top: 60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: 120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0, 196, 159, 0.12)',
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  dotContainer: {
    width: 10,
    height: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotPing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00C49F',
    opacity: 0.5,
  },
  dotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00A884',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#4338ca',
    textTransform: 'uppercase',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  timerClockIcon: {
    fontSize: 14,
    color: '#00A884',
  },
  timerText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  timerBold: {
    color: '#0f172a',
    fontWeight: '800',
  },
  centerSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  radarWrapper: {
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  rippleRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  rippleIndigo: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  rippleTeal: {
    borderColor: 'rgba(0, 196, 159, 0.45)',
  },
  emblemBorder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 3,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  emblemCore: {
    flex: 1,
    borderRadius: 53,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemGlyph: {
    fontSize: 42,
  },
  boltBadge: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  boltIcon: {
    fontSize: 14,
    color: '#0f172a',
  },
  categoryPill: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  jobTitleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  locationPinIcon: {
    fontSize: 16,
    color: '#00A884',
  },
  locationMainText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    maxWidth: SCREEN_WIDTH * 0.45,
  },
  locationDot: {
    fontSize: 13,
    color: '#cbd5e1',
    marginHorizontal: 2,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
  },
  payoutCard: {
    width: Math.min(SCREEN_WIDTH - 64, 280),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  payoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  payoutAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 8,
  },
  callButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 320,
    marginBottom: 14,
  },
  callBtnColumn: {
    alignItems: 'center',
    gap: 8,
  },
  declineCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  declineCallIcon: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  declineLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  acceptButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptPulseRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0, 196, 159, 0.35)',
  },
  acceptCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00C49F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00C49F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  acceptCallIcon: {
    fontSize: 28,
    color: '#032B25',
  },
  acceptLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#00A884',
    textTransform: 'uppercase',
  },
  helperSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  acceptedModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 999,
  },
  acceptedModalCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
    gap: 12,
  },
  verifiedIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ccfbf1',
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedGlyph: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f766e',
  },
  acceptedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  acceptedSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 17,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  guaranteeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  guaranteeAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f766e',
  },
  startNavButton: {
    width: '100%',
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 4,
  },
  startNavText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
