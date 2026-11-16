/**
 * Kweecko brand palette & Design Tokens.
 * Matches the official Kweecko Agent Dashboard design system.
 */
export const colors = {
  // Brand Primaries
  primary: '#B62314',
  primaryContainer: '#FF5841',
  coral: '#FF5841',
  primaryFixed: '#FFDAD4',

  // Brand Secondaries
  secondary: '#AF2367',
  secondaryContainer: '#FE64A5',
  secondaryFixed: '#FFD9E3',
  magenta: '#C53678',
  magentaDark: '#AF2367',

  // Tertiaries
  tertiary: '#00696D',
  tertiaryContainer: '#00A2A7',
  tertiaryFixed: '#7DF5FA',

  // Status & Accents
  success: '#10B981',
  warning: '#F59E0B',
  star: '#FFB800',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',

  // Text
  textDark: '#1B1C1C',
  textMuted: '#5B403C',
  onSurface: '#1B1C1C',
  onSurfaceVariant: '#5B403C',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  onTertiary: '#FFFFFF',

  // Surfaces & Backgrounds
  white: '#FFFFFF',
  background: '#FCF9F8',
  backgroundPeach: '#FFF7F5',
  surface: '#FCF9F8',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F6F3F3',
  surfaceContainer: '#F0EDED',
  surfaceContainerHigh: '#EAE7E7',
  surfaceContainerHighest: '#E4E2E2',

  // Borders & Outlines
  border: '#F0D9D5',
  outline: '#8F706A',
  outlineVariant: '#E3BEB8',
  badgeBackground: 'rgba(197, 54, 120, 0.1)',
} as const;

export const gradients = {
  logoFallback: colors.coral,
  headingAccentFallback: colors.magenta,
};
