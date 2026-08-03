import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { WebView, type WebViewNavigation } from 'react-native-webview';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Per-build target — the ONE thing to change before each `eas build` when
 * reusing this project for a different RKM app (frontend/admin/manager/
 * cashier/sales). Update this URL, then app.json's name/slug/android.package,
 * before building the next one.
 */
const TARGET_URL = 'https://admin.rkmjewellers.com/';

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Edge-to-edge is mandatory/default on this SDK — nothing to enable.
      // Just set the nav bar button color to read against a light webpage.
      NavigationBar.setStyle('dark');
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webviewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onLoadEnd = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webviewRef}
        source={{ uri: TARGET_URL }}
        style={styles.webview}
        onLoadEnd={onLoadEnd}
        onNavigationStateChange={onNavigationStateChange}
        allowsBackForwardNavigationGestures
        overScrollMode="never"
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No SafeAreaView / bottom inset here on purpose — edge-to-edge is
  // mandatory on this SDK, so the WebView fills the full screen height
  // with zero gap at the bottom, drawing behind the system nav bar.
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
});
