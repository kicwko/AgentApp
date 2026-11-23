import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { KweeckoLogo } from '../components/KweeckoLogo';

const ONBOARDING_URL = 'https://kweecko.com/onboarding?isapp=true';
const WebViewComponent = WebView as any;

type Props = {
  onBack: () => void;
  onGoToSignIn?: () => void;
};

export function RegisterScreen({ onBack, onGoToSignIn }: Props) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Handle hardware back button on Android
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backAction = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      onBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [canGoBack, onBack]);

  const handleReload = () => {
    setHasError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (canGoBack && webViewRef.current) {
              webViewRef.current.goBack();
            } else {
              onBack();
            }
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.centerInfo}>
          <Text style={styles.headerTitle}>Partner Onboarding</Text>
          <Text style={styles.headerSub}>kweecko.com/onboarding</Text>
        </View>

        <View style={styles.rightActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleReload}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Refresh page">
            <Text style={styles.actionIcon}>🔄</Text>
          </TouchableOpacity>
          {onGoToSignIn && (
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={onGoToSignIn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Sign In">
              <Text style={styles.signInBtnText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress / Loading bar */}
      {loading && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingBannerText}>Loading Kweecko Onboarding portal...</Text>
        </View>
      )}

      {/* Error state */}
      {hasError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to load Onboarding portal</Text>
          <Text style={styles.errorSub}>
            Please check your internet connection and try again.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleReload}
            activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebViewComponent
          ref={webViewRef}
          source={{ uri: ONBOARDING_URL }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={true}
          geolocationEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onNavigationStateChange={(navState: any) => {
            setCanGoBack(Boolean(navState.canGoBack));
            setLoading(Boolean(navState.loading));
          }}
          onLoadStart={() => {
            setLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setHasError(true);
          }}
          onHttpError={(syntheticEvent: any) => {
            const { nativeEvent } = syntheticEvent;
            if (nativeEvent.statusCode >= 400) {
              console.warn('[RegisterWebView] HTTP error:', nativeEvent.statusCode);
            }
          }}
          renderLoading={() => (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Opening Onboarding Form...</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.8)',
    minHeight: 52,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLow,
    gap: 4,
  },
  backArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  backText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: typography.weightSemibold,
    color: colors.onSurface,
  },
  centerInfo: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: typography.weightBold,
    color: colors.onSurface,
  },
  headerSub: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLow,
  },
  actionIcon: {
    fontSize: 14,
  },
  signInBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  signInBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: typography.weightBold,
    color: '#FFFFFF',
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: colors.surfaceContainer,
    gap: 8,
  },
  loadingBannerText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.primary,
    fontWeight: typography.weightSemibold,
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerLoading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  errorTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: typography.weightBold,
    color: colors.onSurface,
    textAlign: 'center',
  },
  errorSub: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: typography.weightBold,
    color: '#FFFFFF',
  },
});
