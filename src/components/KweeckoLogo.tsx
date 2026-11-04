import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  /** Shrinks the mark for places like a compact header. */
  compact?: boolean;
};

/**
 * Brand mark matching kweecko.com's header: a rounded coral badge with a
 * bolt glyph, plus "KWEECKO" / "PARTNER ECOSYSTEM" text.
 *
 * Uses a solid coral fill instead of the site's coral->magenta gradient
 * since react-native-linear-gradient isn't installed yet.
 */
export function KweeckoLogo({ compact = false }: Props) {
  const iconSize = compact ? 32 : 44;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.iconBox,
          { width: iconSize, height: iconSize, borderRadius: iconSize * 0.3 },
        ]}>
        <Text style={[styles.bolt, { fontSize: iconSize * 0.55 }]}>⚡</Text>
      </View>
      <View style={styles.textGroup}>
        <Text style={[styles.title, compact && styles.titleCompact]}>
          KWEECKO
        </Text>
        {!compact && <Text style={styles.subtitle}>PARTNER ECOSYSTEM</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    backgroundColor: gradients.logoFallback,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bolt: {
    color: colors.white,
  },
  textGroup: {
    justifyContent: 'center',
  },
  title: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightBold,
    fontSize: 20,
    color: colors.textDark,
    letterSpacing: 0.5,
  },
  titleCompact: {
    fontSize: 16,
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 10,
    color: colors.magenta,
    letterSpacing: 1,
    marginTop: 1,
  },
});
