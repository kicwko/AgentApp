/**
 * Kweecko brand uses Inter. Custom font linking needs native setup we're
 * deferring until Xcode/Android Studio are ready, so these fall back to the
 * platform system font for now. Swap `fontFamily` to 'Inter' once the font
 * files are bundled and linked natively.
 */
export const typography = {
  fontFamily: undefined, // platform default until Inter is linked
  weightBold: '800' as const,
  weightSemibold: '600' as const,
  weightRegular: '400' as const,
};
