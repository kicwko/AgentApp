/**
 * KWEECKO Core Design System - Modern Institutional SaaS
 * Matches the official Kweecko design system tokens and SCSS variables.
 */

export const colors = {
  // Surfaces & Backgrounds
  surface: '#FAF8FF',
  surfaceDim: '#D2D9F4',
  surfaceBright: '#FAF8FF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F2F3FF',
  surfaceContainer: '#EAEDFF',
  surfaceContainerHigh: '#E2E7FF',
  surfaceContainerHighest: '#DAE2FD',
  surfaceVariant: '#DAE2FD',
  surfaceTint: '#4D44E3',

  // Neutrals & Text
  onSurface: '#131B2E',
  onSurfaceVariant: '#464555',
  inverseSurface: '#283044',
  inverseOnSurface: '#EEF0FF',
  outline: '#777587',
  outlineVariant: '#C7C4D8',

  // Primary (Cobalt Indigo)
  colorPrimary: '#3525CD',
  colorPrimaryContainer: '#4F46E5',
  colorPrimaryActive: '#3730A3',
  colorOnPrimary: '#FFFFFF',
  colorOnPrimaryContainer: '#DAD7FF',
  colorInversePrimary: '#C3C0FF',
  colorPrimaryFixed: '#E2DFFF',
  colorPrimaryFixedDim: '#C3C0FF',
  colorOnPrimaryFixed: '#0F0069',
  colorOnPrimaryFixedVariant: '#3323CC',

  // Secondary (Electric Teal & Forest)
  colorSecondary: '#006B56',
  colorSecondaryTeal: '#00C49F',
  colorSecondaryHover: '#00B894',
  colorSecondaryContainer: '#63FBD3',
  colorOnSecondaryContainer: '#00725B',
  colorOnSecondary: '#FFFFFF',
  colorSecondaryFixed: '#63FBD3',
  colorSecondaryFixedDim: '#3FDEB7',
  colorOnSecondaryFixed: '#002018',
  colorOnSecondaryFixedVariant: '#005140',

  // Tertiary (Amber Gold)
  colorTertiary: '#684000',
  colorTertiaryGold: '#F59E0B',
  colorTertiaryContainer: '#885500',
  colorOnTertiaryContainer: '#FFD4A4',
  colorTertiaryFixed: '#FFDDB8',
  colorTertiaryFixedDim: '#FFB95F',
  colorOnTertiaryFixed: '#2A1700',
  colorOnTertiaryFixedVariant: '#653E00',

  // Error & Warnings
  colorError: '#BA1A1A',
  colorOnError: '#FFFFFF',
  colorErrorContainer: '#FFDAD6',
  colorOnErrorContainer: '#93000A',
  colorWarningBg: '#FFFBEB',
  colorWarningText: '#B45309',
  colorWarningBorder: '#FDE68A',

  // Status Badges
  badgeActiveBg: '#ECFDF5',
  badgeActiveText: '#047857',
  badgeActiveBorder: '#A7F3D0',

  badgeInfoBg: '#EEF2FF',
  badgeInfoText: '#4338CA',
  badgeInfoBorder: '#C7D2FE',

  badgeWarningBg: '#FFFBEB',
  badgeWarningText: '#B45309',
  badgeWarningBorder: '#FDE68A',

  // Project-wide Semantic Aliases
  primary: '#4F46E5', // $color-primary-container
  primaryDark: '#3525CD', // $color-primary
  primaryHover: '#4338CA',
  primaryActive: '#3730A3',
  primaryGlow: 'rgba(79, 70, 229, 0.25)',

  primaryContainer: '#4F46E5',
  primaryFixed: '#E2DFFF',
  primaryFixedDim: '#C3C0FF',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#DAD7FF',
  inversePrimary: '#C3C0FF',

  secondary: '#00C49F', // $color-secondary-teal
  secondaryDark: '#006B56', // $color-secondary
  secondaryGlow: 'rgba(0, 196, 159, 0.25)',
  secondaryContainer: '#63FBD3',
  secondaryFixed: '#63FBD3',
  secondaryFixedDim: '#3FDEB7',
  onSecondary: '#FFFFFF',
  onSecondaryContainer: '#00725B',

  tertiary: '#684000',
  tertiaryContainer: '#885500',
  tertiaryFixed: '#FFDDB8',
  tertiaryFixedDim: '#FFB95F',
  onTertiary: '#FFFFFF',
  onTertiaryContainer: '#FFD4A4',

  // Status & Accents
  success: '#00C49F',
  warning: '#F59E0B',
  star: '#F59E0B',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onError: '#FFFFFF',
  onErrorContainer: '#93000A',

  // Button background colors (from $grediant-primary / $grediant-primary-hover)
  buttonPrimary: '#4555DC', // Base gradient color (linear-gradient(316deg, #4555dc, #0eb4a7))
  buttonPrimaryHover: '#4F46E5', // Hover gradient color (linear-gradient(316deg, #4f46e5, #006b56))
  buttonPrimaryActive: '#3730A3',

  // Surfaces & Backgrounds
  white: '#FFFFFF',
  background: '#FAF8FF',
  backgroundPeach: '#FAF8FF', // Legacy alias redirected to new institutional surface
  bgWhite: '#FAF8FF',
  bgPrimary: '#FAF8FF',
  bgSecondary: '#F2F3FF',
  bgHeroTop: '#EAEDFF',
  bgSubtle: '#FAF8FF',
  bgCard: '#FFFFFF',
  bgCardHover: '#F2F3FF',
  bgInput: '#FFFFFF',

  // Text Colors
  textDark: '#131B2E',
  textMain: '#131B2E',
  textMuted: '#464555',
  textDim: '#777587',
  textWhite: '#FFFFFF',

  // Borders & Glass
  border: '#EAEDFF',
  borderSubtle: '#EAEDFF',
  borderLight: 'rgba(199, 196, 216, 0.6)',
  borderGlass: '#E2E8F0',
  borderGlassFocus: '#4F46E5',
  glassBackdropBlur: 16,
  glassBoxShadow: '0 4px 20px rgba(19, 27, 46, 0.05)',

  // Transitioned Legacy Aliases
  coral: '#4555DC', // Remapped to primary gradient start / container
  sunsetOrange: '#4F46E5',
  sunsetOrangeHover: '#4338CA',
  redViolet: '#006B56',
  darkCharcoal: '#131B2E',
  bodySlate: '#464555',
  emerald: '#00C49F',
  accentPink: '#006B56',
  accentEmerald: '#00C49F',
  magenta: '#00C49F',
  magentaDark: '#006B56',
  badgeBackground: '#EEF2FF',
} as const;

export const gradients = {
  // Gradient primary: linear-gradient(316deg, #4555dc, #0eb4a7)
  primary: ['#4555DC', '#0EB4A7'] as const,
  // Gradient primary hover: linear-gradient(316deg, #4f46e5, #006b56)
  primaryHover: ['#4F46E5', '#006B56'] as const,
  // 316deg CSS angle and normalized coordinates
  angle: 316,
  angleCenter: { x: 0.5, y: 0.5 },
  start: { x: 0.85, y: 0.85 },
  end: { x: 0.15, y: 0.15 },
  // CSS representation
  primaryCss: 'linear-gradient(316deg, #4555dc, #0eb4a7)',
  primaryHoverCss: 'linear-gradient(316deg, #4f46e5, #006b56)',
  // Fallbacks for React Native components without native gradient linking
  buttonBackground: '#4555DC',
  buttonBackgroundHover: '#4F46E5',
  logoFallback: '#4555DC',
  headingAccentFallback: '#0EB4A7',
};

export const elevation = {
  shadowSm: {
    shadowColor: 'rgba(15, 23, 42, 0.05)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  shadowMd: {
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  shadowLg: {
    shadowColor: 'rgba(15, 23, 42, 0.12)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 25,
    elevation: 6,
  },
};

export const geometry = {
  radiusSm: 4,
  radiusMd: 8,
  radiusLg: 16,
  radiusXl: 24,
  radiusFull: 9999,
};
