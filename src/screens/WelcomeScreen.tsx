import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GradientButton } from '../components/GradientButton';
import { KweeckoLogo } from '../components/KweeckoLogo';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  onSignIn?: () => void;
  onRegister?: () => void;
};

/**
 * Agent-facing welcome screen, styled after kweecko.com's Partner Ecosystem
 * hero section (badge pill, two-tone heading, coral CTA + outline CTA,
 * trust line).
 */
export function WelcomeScreen({ onSignIn, onRegister }: Props) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <KweeckoLogo size="lg" />

      <View style={styles.badge}>
        <Text style={styles.badgeText}>⚡ AGENT PARTNER APP</Text>
      </View>

      <Text style={styles.heading}>
        Get Tasks,{'\n'}
        <Text style={styles.headingAccent}>Earn Daily</Text>
      </Text>

      <Text style={styles.subtext}>
        Sign in to receive instant society bookings near you, track your
        daily tasks, and get paid with zero idle time.
      </Text>

      <GradientButton
        title="Sign In"
        onPress={onSignIn}
        style={styles.primaryButton}
        textStyle={styles.primaryButtonText}
      />

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onRegister}
        activeOpacity={0.85}>
        <Text style={styles.secondaryButtonText}>Create Account</Text>
      </TouchableOpacity>

      <View style={styles.trustRow}>
        <Text style={styles.trustCheck}>✓</Text>
        <Text style={styles.trustText}>
          Trusted by <Text style={styles.trustBold}>1,800+</Text> verified
          local professionals
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPeach,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeInfoBg,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 32,
    borderWidth: 1,
    borderColor: colors.badgeInfoBorder,
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 12,
    color: colors.badgeInfoText,
    letterSpacing: 0.5,
  },
  heading: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 38,
    lineHeight: 44,
    color: colors.textDark,
    marginTop: 18,
  },
  headingAccent: {
    color: colors.primary,
  },
  subtext: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
    marginTop: 16,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.primary,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  trustCheck: {
    color: colors.colorSecondaryTeal,
    fontWeight: typography.weightBold,
    marginRight: 6,
  },
  trustText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.textMuted,
  },
  trustBold: {
    fontWeight: typography.weightBold,
    color: colors.textDark,
  },
});
