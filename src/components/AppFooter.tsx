import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography } from '../theme/typography';

export type TabName = 'dashboard' | 'orders' | 'settings';

type Props = {
  activeTab: TabName;
  onSelectTab: (tab: TabName) => void;
  ordersBadgeCount?: number;
};

/**
 * Speedometer/Gauge vector icon for Dashboard tab
 */
function DashboardIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.iconBox}>
      {/* 270-degree speedometer arch */}
      <View
        style={[
          iconStyles.gaugeArc,
          {
            borderColor: color,
            borderBottomColor: 'transparent',
            transform: [{ rotate: '-45deg' }],
          },
        ]}
      />
      {/* Gauge needle pointing up-right */}
      <View
        style={[
          iconStyles.gaugeNeedle,
          {
            backgroundColor: color,
            transform: [{ rotate: '38deg' }],
          },
        ]}
      />
      {/* Center axle hub */}
      <View style={[iconStyles.gaugeHub, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * Task list/Document vector icon for Orders tab
 */
function OrdersIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.iconBox}>
      <View style={[iconStyles.sheetFrame, { borderColor: color }]}>
        {/* Top header divider */}
        <View style={[iconStyles.sheetDivider, { backgroundColor: color }]} />
        {/* Item line 1 */}
        <View style={[iconStyles.sheetLine1, { backgroundColor: color }]} />
        {/* Item line 2 */}
        <View style={[iconStyles.sheetLine2, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/**
 * Mechanical gear vector icon for Settings tab
 */
function SettingsIcon({ color, isActive }: { color: string; isActive: boolean }) {
  return (
    <View style={iconStyles.iconBox}>
      {/* 4 axes for 8 teeth */}
      <View style={[iconStyles.gearTooth, { width: 16, height: 3.2, backgroundColor: color }]} />
      <View style={[iconStyles.gearTooth, { width: 3.2, height: 16, backgroundColor: color }]} />
      <View
        style={[
          iconStyles.gearTooth,
          { width: 16, height: 3.2, backgroundColor: color, transform: [{ rotate: '45deg' }] },
        ]}
      />
      <View
        style={[
          iconStyles.gearTooth,
          { width: 16, height: 3.2, backgroundColor: color, transform: [{ rotate: '-45deg' }] },
        ]}
      />
      {/* Outer gear rim */}
      <View
        style={[
          iconStyles.gearRim,
          {
            borderColor: color,
            backgroundColor: isActive ? 'rgba(255, 88, 65, 0.12)' : '#FFFFFF',
          },
        ]}
      />
      {/* Center axle hole */}
      <View style={[iconStyles.gearAxle, { backgroundColor: color }]} />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  iconBox: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dashboard Icon
  gaugeArc: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.8,
  },
  gaugeNeedle: {
    position: 'absolute',
    width: 1.8,
    height: 5.5,
    borderRadius: 1,
    top: 3.2,
    right: 4.8,
  },
  gaugeHub: {
    position: 'absolute',
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    bottom: 3.2,
    alignSelf: 'center',
  },
  // Orders Icon
  sheetFrame: {
    width: 14,
    height: 15,
    borderRadius: 2.5,
    borderWidth: 1.8,
    alignItems: 'center',
    paddingTop: 3,
  },
  sheetDivider: {
    width: 10,
    height: 1.2,
    opacity: 0.6,
    marginBottom: 2,
  },
  sheetLine1: {
    width: 7.5,
    height: 1.4,
    borderRadius: 1,
    marginBottom: 1.8,
  },
  sheetLine2: {
    width: 5.5,
    height: 1.4,
    borderRadius: 1,
  },
  // Settings Icon
  gearTooth: {
    position: 'absolute',
    borderRadius: 1,
  },
  gearRim: {
    position: 'absolute',
    width: 12.5,
    height: 12.5,
    borderRadius: 6.25,
    borderWidth: 1.8,
  },
  gearAxle: {
    position: 'absolute',
    width: 3.8,
    height: 3.8,
    borderRadius: 2,
  },
});

/**
 * Floating Capsule Bottom Navigation Footer (Variant 1: Active Pill Badge)
 * Modern floating capsule navigation bar with soft active coral accent (#FF5841),
 * micro-badge counters, and tactile pill highlights.
 */
export function AppFooter({
  activeTab,
  onSelectTab,
  ordersBadgeCount,
}: Props) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    insets = useSafeAreaInsets();
  } catch (_) {
    // Fallback if rendered outside SafeAreaProvider (e.g., in unit tests)
  }

  const tabs: Array<{
    key: TabName;
    label: string;
    badge?: number;
  }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'orders', label: 'Orders', badge: ordersBadgeCount },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.capsule}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          const activeColor = '#FF5841';
          const inactiveColor = '#64748B';
          const tabColor = isActive ? activeColor : inactiveColor;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => onSelectTab(tab.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}>
              <View style={styles.iconWrap}>
                {tab.key === 'dashboard' && <DashboardIcon color={tabColor} />}
                {tab.key === 'orders' && <OrdersIcon color={tabColor} />}
                {tab.key === 'settings' && <SettingsIcon color={tabColor} isActive={isActive} />}
              </View>

              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}>
                {tab.label}
              </Text>

              {tab.badge !== undefined && tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  capsule: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // iOS floating shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    // Android elevation
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 999,
    marginHorizontal: 2,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: 'rgba(255, 88, 65, 0.10)', // bg-[#FF5841]/10
  },
  iconWrap: {
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  tabLabelActive: {
    fontWeight: '700',
    color: '#FF5841',
  },
  tabLabelInactive: {
    fontWeight: '600',
    color: '#64748B',
  },
  badge: {
    backgroundColor: '#C53678', // bg-[#C53678]
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
    shadowColor: '#C53678',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    textAlign: 'center',
  },
});
