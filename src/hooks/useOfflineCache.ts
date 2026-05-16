import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';

const CACHE_KEYS = {
  providers: 'offline_providers',
  categories: 'offline_categories',
  packages: 'offline_packages',
  paymentProviders: 'offline_payment_providers',
  deliveryInstructions: 'offline_delivery_instructions',
  banners: 'offline_banners',
  appSettings: 'offline_app_settings',
};

const CACHE_TIMESTAMP_KEY = 'offline_cache_timestamp';
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export const useOfflineCache = () => {
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const hasLoadedRef = useRef(false);
  const hasCachedRef = useRef(false);

  // Force refresh - ignores TTL, used during splash screen
  const forceRefreshCache = async () => {
    if (!isReallyOnline) return;
    console.log('🔄 Force refreshing cache (splash screen)...');
    await cacheData();
  };

  const cacheData = async () => {
    try {
      // Cache providers
      const { data: providers } = await supabase.rpc('get_active_providers');
      if (providers) {
        localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(providers));
        queryClient.setQueryData(['providers'], providers);
        
        // Images are now local assets - no need to pre-fetch from Supabase Storage
      }

      // Cache categories with deduplication
      const { data: categories } = await supabase.rpc('get_active_categories');
      if (categories) {
        const uniqueCategories = Array.from(
          new Map(categories.map((cat: any) => [cat.id, cat])).values()
        );
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
        
        // Images are now local assets - no need to pre-fetch
      }

      // Cache payment providers
      const { data: paymentProviders } = await supabase.rpc('get_active_payment_providers');
      if (paymentProviders) {
        localStorage.setItem(CACHE_KEYS.paymentProviders, JSON.stringify(paymentProviders));
        queryClient.setQueryData(['paymentProviders'], paymentProviders);
        
        // Images are now local assets - no need to pre-fetch
      }

      // Cache packages for each provider
      if (providers) {
        const allPackages: any = {};
        for (const provider of providers) {
          const { data: packages } = await supabase.rpc('get_public_packages', { 
            provider_uuid: provider.id 
          });
          if (packages) {
            allPackages[provider.id] = packages;
            queryClient.setQueryData(['packages', provider.id], packages);
          }
        }
        localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(allPackages));
      }

      // Cache delivery instructions
      const { data: deliveryInstructions } = await supabase
        .from('delivery_instructions')
        .select('*');
      if (deliveryInstructions) {
        localStorage.setItem(CACHE_KEYS.deliveryInstructions, JSON.stringify(deliveryInstructions));
      }

      // Cache featured packages
      const { data: featuredPackages } = await supabase.rpc('get_featured_packages');
      if (featuredPackages) {
        localStorage.setItem('offline_featured_packages', JSON.stringify(featuredPackages));
        queryClient.setQueryData(['featuredPackages'], featuredPackages);
      }

      // Cache banners
      const { data: banners } = await supabase
        .from('banners_config')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (banners) {
        localStorage.setItem(CACHE_KEYS.banners, JSON.stringify(banners));
        // Images are now local assets - no need to pre-fetch
      }

      // Cache app settings
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .in('setting_key', ['iftin_payment_number', 'iftin_payment_prefix']);
      
      if (appSettings) {
        localStorage.setItem(CACHE_KEYS.appSettings, JSON.stringify(appSettings));
      }

      // Update cache timestamp
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      // Silent error handling
    }
  };

  const loadCachedData = () => {
    try {
      const cachedProviders = localStorage.getItem(CACHE_KEYS.providers);
      if (cachedProviders) {
        queryClient.setQueryData(['providers'], JSON.parse(cachedProviders));
      }

      const cachedCategories = localStorage.getItem(CACHE_KEYS.categories);
      if (cachedCategories) {
        const categories = JSON.parse(cachedCategories);
        const uniqueCategories = Array.from(
          new Map(categories.map((cat: any) => [cat.id, cat])).values()
        );
        localStorage.setItem(CACHE_KEYS.categories, JSON.stringify(uniqueCategories));
        queryClient.setQueryData(['categories'], uniqueCategories);
      }

      const cachedPaymentProviders = localStorage.getItem(CACHE_KEYS.paymentProviders);
      if (cachedPaymentProviders) {
        queryClient.setQueryData(['paymentProviders'], JSON.parse(cachedPaymentProviders));
      }

      const cachedPackages = localStorage.getItem(CACHE_KEYS.packages);
      if (cachedPackages) {
        const packagesData = JSON.parse(cachedPackages);
        Object.entries(packagesData).forEach(([providerId, packages]) => {
          queryClient.setQueryData(['packages', providerId], packages);
        });
      }

      const cachedFeaturedPackages = localStorage.getItem('offline_featured_packages');
      if (cachedFeaturedPackages) {
        queryClient.setQueryData(['featuredPackages'], JSON.parse(cachedFeaturedPackages));
      }
    } catch (error) {
      // Silent error handling
    }
  };

  const isCacheStale = (): boolean => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return true;
    return Date.now() - parseInt(timestamp, 10) > CACHE_TTL_MS;
  };

  useEffect(() => {
    // Load cached data immediately on first mount only
    if (!hasLoadedRef.current) {
      loadCachedData();
      hasLoadedRef.current = true;
    }
  }, []);

  // Cache fresh data when online on each app open so published/admin updates appear fast
  useEffect(() => {
    if (isReallyOnline && !hasCachedRef.current) {
      cacheData();
      hasCachedRef.current = true;
    }
  }, [isReallyOnline]);

  // Refresh again when user returns to the app and cache is stale
  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && isCacheStale()) {
        cacheData();
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isReallyOnline]);

  // Realtime: invalidate cache when providers or packages change
  useEffect(() => {
    const channelName = `offline-cache-invalidation-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'providers_config' },
        async () => {
          // Re-fetch only providers
          const { data } = await supabase.rpc('get_active_providers');
          if (data) {
            localStorage.setItem(CACHE_KEYS.providers, JSON.stringify(data));
            queryClient.setQueryData(['providers'], data);
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_packages_config' },
        async () => {
          // Re-fetch packages for all providers
          const providersStr = localStorage.getItem(CACHE_KEYS.providers);
          if (!providersStr) return;
          const providers = JSON.parse(providersStr);
          const allPackages: any = {};
          for (const provider of providers) {
            const { data } = await supabase.rpc('get_public_packages', { provider_uuid: provider.id });
            if (data) {
              allPackages[provider.id] = data;
              queryClient.setQueryData(['packages', provider.id], data);
            }
          }
          localStorage.setItem(CACHE_KEYS.packages, JSON.stringify(allPackages));
          // Also refresh featured packages
          const { data: featured } = await supabase.rpc('get_featured_packages');
          if (featured) {
            localStorage.setItem('offline_featured_packages', JSON.stringify(featured));
            queryClient.setQueryData(['featuredPackages'], featured);
          }
          localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    cacheData,
    loadCachedData,
    forceRefreshCache,
  };
};
