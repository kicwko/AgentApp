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

type Props = {
  isOnDuty?: boolean;
  onToggleDuty?: () => void;
  onPressProfile?: () => void;
  title?: string;
  showDutyToggle?: boolean;
};

export function AppHeader({
  isOnDuty = true,
  onToggleDuty,
  onPressProfile,
  title = 'KWEEKO',
  showDutyToggle = true,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.content}>
        {/* Logo and Brand Title */}
        <View style={styles.brandGroup}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoGlyph}>⚡</Text>
          </View>
          <Text style={styles.brandTitle}>{title}</Text>
        </View>

        {/* Right actions: Duty toggle + Profile avatar */}
        <View style={styles.actionsGroup}>
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(252, 249, 248, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240, 217, 213, 0.6)',
    zIndex: 50,
  },
  content: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  logoGlyph: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  brandTitle: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 18,
    letterSpacing: -0.5,
    color: colors.textDark,
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

