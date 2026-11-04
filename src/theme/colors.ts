/**
 * Kweecko brand palette.
 * Source of truth: https://kweecko.com (Partner Ecosystem marketing site).
 * Keep this in sync if the brand site's palette changes.
 */
export const colors = {
  // Primary brand colors
  coral: '#FF5841',
  magenta: '#C53678',
  magentaDark: '#AF2367',

  // Text
  textDark: '#1E293B',
  textMuted: '#5B403C',

  // Surfaces
  white: '#FFFFFF',
  backgroundPeach: '#FFF7F5',
  badgeBackground: 'rgba(197, 54, 120, 0.1)',
  border: '#F0D9D5',
} as const;

export const gradients = {
  // True gradients need react-native-linear-gradient (not yet installed).
  // Until then, these solid fallbacks approximate each gradient's midpoint.
  logoFallback: colors.coral,
  headingAccentFallback: colors.magenta,
};
