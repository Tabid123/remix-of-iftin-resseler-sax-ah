import { Capacitor } from '@capacitor/core';

let FirebaseAnalytics: any = null;
let FirebaseCrashlytics: any = null;

export const initializeFirebase = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    // Dynamic import to avoid web bundle issues
    const analyticsModule = await import('@capacitor-firebase/analytics');
    const crashlyticsModule = await import('@capacitor-firebase/crashlytics');
    
    FirebaseAnalytics = analyticsModule.FirebaseAnalytics;
    FirebaseCrashlytics = crashlyticsModule.FirebaseCrashlytics;
    
    await FirebaseAnalytics.setEnabled({ enabled: true });
    await FirebaseCrashlytics.setEnabled({ enabled: true });
    console.log('Firebase Analytics & Crashlytics initialized');
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
};

export const logScreenView = async (screenName: string) => {
  if (!Capacitor.isNativePlatform() || !FirebaseAnalytics) return;
  
  try {
    await FirebaseAnalytics.logEvent({
      name: 'screen_view',
      params: { screen_name: screenName }
    });
  } catch (error) {
    console.error('logScreenView error:', error);
  }
};

export const logPurchase = async (packageName: string, price: number, provider: string) => {
  if (!Capacitor.isNativePlatform() || !FirebaseAnalytics) return;
  
  try {
    await FirebaseAnalytics.logEvent({
      name: 'purchase',
      params: {
        item_name: packageName,
        value: price,
        currency: 'USD',
        provider: provider
      }
    });
  } catch (error) {
    console.error('logPurchase error:', error);
  }
};

export const logEvent = async (name: string, params?: Record<string, any>) => {
  if (!Capacitor.isNativePlatform() || !FirebaseAnalytics) return;
  
  try {
    await FirebaseAnalytics.logEvent({ name, params });
  } catch (error) {
    console.error('logEvent error:', error);
  }
};

export const recordError = async (error: Error) => {
  if (!Capacitor.isNativePlatform() || !FirebaseCrashlytics) return;
  
  try {
    await FirebaseCrashlytics.recordException({
      message: error.message
    });
  } catch (err) {
    console.error('recordError error:', err);
  }
};
