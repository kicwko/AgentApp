import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type TabName = 'dashboard' | 'orders' | 'settings';

type Props = {
  activeTab: TabName;
  onSelectTab: (tab: TabName) => void;
  ordersBadgeCount?: number;
};

export function AppFooter({
  activeTab,
  onSelectTab,
  ordersBadgeCount,
}: Props) {
  const insets = useSafeAreaInsets();

  const tabs: Array<{
    key: TabName;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { key: 'dashboard', label: 'Dashboard', icon: '⚡' },
    { key: 'orders', label: 'Orders', icon: '📋', badge: ordersBadgeCount },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.content}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => onSelectTab(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}>
              <View
                style={[
                  styles.tabPill,
                  isActive && styles.tabPillActive,
                ]}>
                <View style={styles.iconContainer}>
                  <Text
                    style={[
                      styles.tabIcon,
                      isActive ? styles.tabIconActive : styles.tabIconInactive,
                    ]}>
                    {tab.icon}
                  </Text>

                  {tab.badge !== undefined && tab.badge > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{tab.badge}</Text>
                    </View>
                  )}
                </View>

                <Text
                  style={[
                    styles.tabLabel,
                    isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}>
                  {tab.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    shadowColor: colors.primaryGlow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {},
  tabPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    minWidth: 80,
    gap: 2,
  },
  tabPillActive: {
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#D4D8FD',
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 24,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabIconActive: {
    transform: [{ scale: 1.15 }],
  },
  tabIconInactive: {
    opacity: 0.55,
  },
  tabLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  tabLabelActive: {
    fontWeight: '700',
    color: '#3525CD',
  },
  tabLabelInactive: {
    fontWeight: '500',
    color: '#64748B',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});

