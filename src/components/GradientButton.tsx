import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import { colors, gradients } from '../theme/colors';
import { typography } from '../theme/typography';

const primaryGradientImage = require('../assets/images/primaryGradient.png');

// Safely probe if native BVLinearGradient is linked and registered in the running binary.
// This prevents "View config not found for component `BVLinearGradient`" crashes
// when running Metro without a fresh native APK build.
const isNativeGradientLinked = (): boolean => {
  try {
    return Boolean(
      (UIManager as any).getViewManagerConfig?.('BVLinearGradient') ||
      (UIManager as any).BVLinearGradient
    );
  } catch {
    return false;
  }
};

let NativeLinearGradient: any = null;
if (isNativeGradientLinked()) {
  try {
    NativeLinearGradient = require('react-native-linear-gradient').default;
  } catch {
    NativeLinearGradient = null;
  }
}

export type GradientButtonProps = {
  title?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  gradientColors?: readonly [string, string, ...string[]];
  angle?: number;
  useAngle?: boolean;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  activeOpacity?: number;
  children?: React.ReactNode;
  accessibilityLabel?: string;
};

/**
 * Reusable Kweecko Primary Gradient Button.
 * Replaces flat solid button fills with the brand linear gradient:
 *   $grediant-primary: linear-gradient(316deg, #4555dc, #0eb4a7)
 *
 * Automatically separates outer shadow/layout styles from inner gradient
 * padding/alignment so existing button styles drop in cleanly.
 *
 * Safe across both native-linked builds and Metro live-reloads:
 * Uses high-res GPU-rendered gradient texture fallback if BVLinearGradient
 * native module is not registered in the currently running APK.
 */
export function GradientButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  loadingText,
  icon,
  style,
  contentStyle,
  textStyle,
  gradientColors = gradients.primary,
  angle = gradients.angle,
  useAngle = true,
  start = gradients.start,
  end = gradients.end,
  activeOpacity = 0.85,
  children,
  accessibilityLabel,
}: GradientButtonProps) {
  const flatStyle = (StyleSheet.flatten(style) || {}) as Record<string, any>;

  // Extract layout, margin, and shadow properties for the outer Touchable
  const {
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    position,
    top,
    bottom,
    left,
    right,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    zIndex,
    opacity,
    shadowColor,
    shadowOffset,
    shadowOpacity,
    shadowRadius,
    elevation,
    backgroundColor: _ignoredBg,
    borderRadius,
    ...restInnerStyle
  } = flatStyle;

  const resolvedRadius = borderRadius ?? 999;

  const outerContainerStyle: ViewStyle = {
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    position,
    top,
    bottom,
    left,
    right,
    width,
    height,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    zIndex,
    borderRadius: resolvedRadius,
    opacity: disabled ? 0.55 : opacity,
    shadowColor: shadowColor ?? colors.primary,
    shadowOffset: shadowOffset ?? { width: 0, height: 4 },
    shadowOpacity: shadowOpacity ?? 0.25,
    shadowRadius: shadowRadius ?? 8,
    elevation: elevation ?? 3,
  };

  const gradientInnerStyle: ViewStyle = {
    borderRadius: resolvedRadius,
    paddingVertical: restInnerStyle.paddingVertical ?? (height ? 0 : 16),
    paddingHorizontal: restInnerStyle.paddingHorizontal ?? 20,
    alignItems: restInnerStyle.alignItems ?? 'center',
    justifyContent: restInnerStyle.justifyContent ?? 'center',
    flexDirection: restInnerStyle.flexDirection ?? 'row',
    gap: restInnerStyle.gap ?? 8,
    overflow: 'hidden',
    position: 'relative',
    ...(height ? { height: '100%' } : {}),
    ...(width ? { width: '100%' } : {}),
    ...restInnerStyle,
  };

  const innerContent = loading ? (
    <View style={styles.contentRow}>
      <ActivityIndicator color={colors.white} size="small" />
      {loadingText ? (
        <Text style={[styles.text, textStyle]}>{loadingText}</Text>
      ) : null}
    </View>
  ) : children ? (
    children
  ) : (
    <View style={styles.contentRow}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      {title ? <Text style={[styles.text, textStyle]}>{title}</Text> : null}
    </View>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
      style={[styles.baseContainer, outerContainerStyle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}>
      {NativeLinearGradient ? (
        <NativeLinearGradient
          colors={[...gradientColors]}
          useAngle={useAngle}
          angle={angle}
          angleCenter={gradients.angleCenter}
          start={start}
          end={end}
          style={[gradientInnerStyle, contentStyle]}>
          {innerContent}
        </NativeLinearGradient>
      ) : (
        <View style={[gradientInnerStyle, styles.gradientFallbackContainer, contentStyle]}>
          <Image
            source={primaryGradientImage}
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: resolvedRadius },
            ]}
            resizeMode="cover"
          />
          {innerContent}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  baseContainer: {
    backgroundColor: 'transparent',
  },
  gradientFallbackContainer: {
    backgroundColor: colors.buttonPrimary,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fontFamily,
    fontWeight: typography.weightSemibold,
    fontSize: 16,
    color: colors.white,
    textAlign: 'center',
    zIndex: 2,
  },
});
