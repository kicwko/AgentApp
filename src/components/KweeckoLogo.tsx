import React from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import logoIcon from '../assets/images/kweecko.png';
import kweeckoDetails from '../assets/images/KweeckoDetails.png';
import kweeckoText from '../assets/images/KweeckoText.png';

export type KweeckoLogoSize = 'sm' | 'md' | 'lg';

export type KweeckoLogoProps = {
  /**
   * 'sm' for headers, 'md' for compact modal/auth headers, 'lg' for hero/welcome screen.
   * If compact is passed, it maps to 'sm'.
   */
  size?: KweeckoLogoSize;
  /** Legacy alias: if true, sizes to compact 'sm'. */
  compact?: boolean;
  /** Whether to show the subtitle tagline ('INSTANT SERVICES ON DEMAND'). Default true. */
  showSubtitle?: boolean;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Optional press handler if used as a navigation link (e.g. back to home) */
  onPress?: () => void;
};

const DIMENSIONS: Record<
  KweeckoLogoSize,
  {
    iconSize: number;
    titleWidth: number;
    titleHeight: number;
    subtitleWidth: number;
    subtitleHeight: number;
    gap: number;
    textMarginTop: number;
    subtitleMarginTop: number;
  }
> = {
  sm: {
    iconSize: 38,
    titleWidth: 108,
    titleHeight: 14,
    subtitleWidth: 138,
    subtitleHeight: 7.5,
    gap: 8,
    textMarginTop: 1,
    subtitleMarginTop: 3,
  },
  md: {
    iconSize: 44,
    titleWidth: 126,
    titleHeight: 16.2,
    subtitleWidth: 162,
    subtitleHeight: 8.8,
    gap: 10,
    textMarginTop: 2,
    subtitleMarginTop: 4,
  },
  lg: {
    iconSize: 58,
    titleWidth: 160,
    titleHeight: 20.6,
    subtitleWidth: 205,
    subtitleHeight: 11.1,
    gap: 12,
    textMarginTop: 4,
    subtitleMarginTop: 5,
  },
};

/**
 * Official Kweecko Brand Logo Header & Hero Component.
 * Fetches and displays the official web design assets:
 * - Brand Logo Icon (kweecko.png)
 * - Brand Wordmark Title (KweeckoText.png)
 * - Tagline Subtitle (KweeckoDetails.png)
 */
export function KweeckoLogo({
  size,
  compact = false,
  showSubtitle = true,
  style,
  onPress,
}: KweeckoLogoProps) {
  const resolvedSize: KweeckoLogoSize = size ?? (compact ? 'sm' : 'lg');
  const d = DIMENSIONS[resolvedSize];

  const content = (
    <View style={[styles.container, { gap: d.gap }, style]}>
      {/* Brand Logo Icon */}
      <View
        style={[
          styles.logoBox,
          { width: d.iconSize, height: d.iconSize },
        ]}>
        <Image
          source={logoIcon}
          style={[styles.logoImage, { width: d.iconSize, height: d.iconSize }]}
          resizeMode="contain"
          accessibilityLabel="Kweecko Logo Mark"
        />
      </View>

      {/* Brand Text Group (Title + Subtitle) */}
      <View style={[styles.textGroup, { marginTop: d.textMarginTop }]}>
        <Image
          source={kweeckoText}
          style={{ width: d.titleWidth, height: d.titleHeight }}
          resizeMode="contain"
          accessibilityLabel="KWEECKO"
        />

        {showSubtitle && (
          <Image
            source={kweeckoDetails}
            style={{
              width: d.subtitleWidth,
              height: d.subtitleHeight,
              marginTop: d.subtitleMarginTop,
            }}
            resizeMode="contain"
            accessibilityLabel="Instant Services On Demand"
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Go to Home">
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoImage: {
    flexShrink: 0,
  },
  textGroup: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
});
