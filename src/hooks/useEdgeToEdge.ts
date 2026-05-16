import { useEffect } from 'react';
import { App } from '@capacitor/app';

// Detect Android WebView using User-Agent (works even with Capacitor remote URL)
const isAndroidWebView = (): boolean => {
  if (typeof window === 'undefined' || !navigator?.userAgent) return false;
  const ua = navigator.userAgent;
  return /Android/.test(ua) && ua.includes('wv');
};

// Parse Android version from User-Agent string
const getAndroidVersion = (): number => {
  if (typeof window === 'undefined' || !navigator?.userAgent) return 0;
  const match = navigator.userAgent.match(/Android\s(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

export const useEdgeToEdge = () => {
  useEffect(() => {
    // Universal safe area for all platforms
    const setSafeArea = () => {
      if (isAndroidWebView()) {
        const ver = getAndroidVersion();
        let padding = '18px'; // Default for Android 13-14
        if (ver >= 15) {
          padding = '32px';
        } else if (ver < 13) {
          padding = '0px';
        }
        document.documentElement.style.setProperty('--effective-safe-area-top', padding);
        console.log(`Android ${ver} WebView - safe area: ${padding}`);
      } else {
        // iOS and Web: Use safe area insets
        document.documentElement.style.setProperty(
          '--effective-safe-area-top',
          'env(safe-area-inset-top, 0px)'
        );
      }
    };
    
    // Run immediately on mount
    setSafeArea();
    
    // Re-apply on app resume (coming back from background)
    let resumeListener: { remove: () => void } | undefined;
    
    // Try to use Capacitor App listener if available
    if (typeof App !== 'undefined' && App.addListener) {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          setSafeArea();
          console.log('App resumed - reapplied safe area CSS');
        }
      }).then(listener => {
        resumeListener = listener;
      }).catch(() => {
        // App listener not available in remote URL mode
      });
    }
    
    // Also handle visibility change (works everywhere)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setSafeArea();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup
    return () => {
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};
