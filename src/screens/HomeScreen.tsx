import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KweeckoLogo } from '../components/KweeckoLogo';
import { signOutUser, type User } from '../services/firebaseAuth';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  user: User;
};

/**
 * Placeholder post-login screen. Task-fetching from a backend isn't built
 * yet — this just confirms the signed-in identity and offers sign out.
 */
export function HomeScreen({ user }: Props) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutUser();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KweeckoLogo />

      <View style={styles.card}>
        <Text style={styles.greeting}>You're signed in</Text>
        <Text style={styles.email}>{user.email ?? user.uid}</Text>
      </View>

      <Text style={styles.subtext}>
        Task assignments aren't wired up yet — this screen just confirms
        Firebase Auth is working end to end.
      </Text>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.85}>
        {signingOut ? (
          <ActivityIndicator color={colors.coral} />
        ) : (
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPeach,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 32,
  },
  greeting: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 20,
    color: colors.textDark,
  },
  email: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 6,
  },
  subtext: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: 20,
  },
  signOutButton: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.coral,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  signOutButtonText: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.coral,
  },
});
