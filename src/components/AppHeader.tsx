import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KweeckoLogo } from './KweeckoLogo';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  isOnDuty?: boolean;
  onToggleDuty?: () => void;
  onPressProfile?: () => void;
  onPressLogo?: () => void;
  title?: string;
  showDutyToggle?: boolean;
  showProfile?: boolean;
  onSignOut?: () => void;
  rightAction?: React.ReactNode;
};

export function AppHeader({
  isOnDuty = true,
  onToggleDuty,
  onPressProfile,
  onPressLogo,
  showDutyToggle = true,
  showProfile = true,
  onSignOut,
  rightAction,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.content}>
        {/* Official Header Brand Logo */}
        <KweeckoLogo
          size="sm"
          showSubtitle={true}
          onPress={onPressLogo}
          style={styles.headerLogo}
        />

        {/* Right actions: Duty toggle + Profile avatar or Sign Out */}
        <View style={styles.actionsGroup}>
          {rightAction}

          {onSignOut && (
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={onSignOut}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Sign Out">
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          )}

          {showDutyToggle && (
            <TouchableOpacity
              style={styles.dutyButton}
              onPress={onToggleDuty}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Toggle Duty Status">
              <View
                style={[
                  styles.statusDot,
                  isOnDuty ? styles.statusDotOn : styles.statusDotOff,
                ]}
              />
              <Text style={styles.dutyText}>
                {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
              </Text>
            </TouchableOpacity>
          )}

          {showProfile && !onSignOut && (
            <TouchableOpacity
              style={styles.profileWrapper}
              onPress={onPressProfile}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="User profile">
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarIcon}>👤</Text>
              </View>
              <View
                style={[
                  styles.avatarStatusBadge,
                  isOnDuty ? styles.statusDotOn : styles.statusDotOff,
                ]}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.8)',
    zIndex: 50,
  },
  content: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    flexShrink: 1,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signOutButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: typography.weightSemibold,
    color: colors.onSurfaceVariant,
  },
  dutyButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainer,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotOn: {
    backgroundColor: colors.success,
  },
  statusDotOff: {
    backgroundColor: colors.outline,
  },
  dutyText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 12,
    color: colors.onSurface,
    letterSpacing: 0.2,
  },
  profileWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    color: colors.white,
    fontSize: 14,
  },
  avatarStatusBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
