import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } from '@capacitor-community/admob';

const ADMOB_APP_ID = 'ca-app-pub-5845806199436628~8041425865';
const BANNER_AD_UNIT_ID = 'ca-app-pub-5845806199436628/2635032427';

let isInitialized = false;
let isBannerShowing = false;

export const initializeAdMob = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    console.log('AdMob: Skipping initialization on web platform');
    return;
  }

  if (isInitialized) {
    console.log('AdMob: Already initialized');
    return;
  }

  try {
    await AdMob.initialize({
      initializeForTesting: false,
    });
    
    isInitialized = true;
    console.log('AdMob: Initialized successfully');

    // Listen for banner events
    AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      console.log('AdMob: Banner loaded');
    });

    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error) => {
      console.error('AdMob: Banner failed to load', error);
      isBannerShowing = false;
    });

  } catch (error) {
    console.error('AdMob: Initialization failed', error);
  }
};

export const showBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (!isInitialized) {
    console.log('AdMob: Not initialized, initializing first...');
    await initializeAdMob();
  }

  if (isBannerShowing) {
    console.log('AdMob: Banner already showing');
    return;
  }

  try {
    await AdMob.showBanner({
      adId: BANNER_AD_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 60, // Above bottom navigation
      isTesting: false,
    });
    
    isBannerShowing = true;
    console.log('AdMob: Banner shown');
  } catch (error) {
    console.error('AdMob: Failed to show banner', error);
  }
};

export const hideBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (!isBannerShowing) {
    return;
  }

  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
    console.log('AdMob: Banner hidden');
  } catch (error) {
    console.error('AdMob: Failed to hide banner', error);
  }
};

export const removeBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    console.log('AdMob: Banner removed');
  } catch (error) {
    console.error('AdMob: Failed to remove banner', error);
  }
};
