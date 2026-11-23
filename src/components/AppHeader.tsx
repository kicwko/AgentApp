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
  onPressLogo?: () => void;
  title?: string;
  showDutyToggle?: boolean;
  showSignOut?: boolean;
  onSignOut?: () => void;
  rightAction?: React.ReactNode;
};

export function AppHeader({
  isOnDuty = true,
  onToggleDuty,
  onPressLogo,
  showDutyToggle = true,
  showSignOut = false,
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

        {/* Right actions: Duty toggle / Sign out / custom */}
        <View style={styles.actionsGroup}>
          {rightAction}

          {showSignOut && onSignOut && (
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={onSignOut}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Sign Out">
              <Text style={styles.signOutButtonText}>Sign Out</Text>
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
  signOutButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 12,
    color: '#DC2626',
    letterSpacing: 0.2,
  },
});
