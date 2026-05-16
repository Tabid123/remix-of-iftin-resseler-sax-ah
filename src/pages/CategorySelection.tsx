import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Phone, MessageCircle, Wifi, ArrowLeft, Edit, Sun, CalendarDays, CalendarRange, Infinity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RotatingBanner from '@/components/RotatingBanner';
import { Button } from '@/components/ui/button';
import { BottomNavigation } from '@/components/BottomNavigation';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import type { RealtimeChannel } from '@supabase/supabase-js';
interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id?: string | null;
  category_image?: string | null;
  created_at?: string;
  updated_at?: string;
}
const CategorySelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const {
    provider
  } = useParams<{
    provider: string;
  }>();
  const providerName = location.state?.providerName || 'Provider';

  // Show banner ad when component mounts
  useEffect(() => {
    showBannerAd();
    return () => {
      hideBannerAd();
    };
  }, []);

  // Realtime subscription for package_categories changes
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel('categories-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Read offline state and phone numbers from navigation
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';
  // First, get the provider ID if we have a provider name instead of UUID
  const {
    data: providerData
  } = useQuery({
    queryKey: ['provider-lookup', provider],
    queryFn: async () => {
      // Check if provider is already a UUID (contains hyphens)
      if (provider?.includes('-')) {
        return {
          id: provider
        };
      }

      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_providers');
        if (cached) {
          const providers = JSON.parse(cached);
          // Try exact name match first
          let prov = providers.find((p: any) => 
            p.provider_name.toLowerCase() === provider?.toLowerCase()
          );
          // Also try by ID match
          if (!prov) {
            prov = providers.find((p: any) => 
              p.id === provider || p.id.toLowerCase() === provider?.toLowerCase()
            );
          }
          if (prov) {
            return { id: prov.id };
          }
        }
        // Return null if no match found - prevents wrong filtering
        return null;
      }

      // Otherwise, look up provider by name
      const {
        data,
        error
      } = await supabase.from('providers_config').select('id').ilike('provider_name', provider || '').single();
      if (error) throw error;
      return data;
    },
    enabled: !!provider,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    retry: false,
  });
  const providerId = providerData?.id;
  
  // Get cached categories for offline use - completely self-contained, doesn't depend on providerId state
  const getCachedCategories = (): Category[] => {
    try {
      const cached = localStorage.getItem('offline_categories');
      const cachedProviders = localStorage.getItem('offline_providers');
      
      if (!cached || !cachedProviders) return [];
      
      const allCategories = JSON.parse(cached) as Category[];
      const providers = JSON.parse(cachedProviders);
      
      // Resolve provider UUID directly from URL param (don't depend on async providerId)
      let actualProviderId: string | null = null;
      
      // If provider param is already a UUID
      if (provider?.includes('-')) {
        actualProviderId = provider;
      } else if (provider) {
        // Find provider by name or ID in cache
        const prov = providers.find((p: any) => 
          p.provider_name.toLowerCase() === provider.toLowerCase() ||
          p.id === provider ||
          p.id.toLowerCase() === provider.toLowerCase()
        );
        if (prov) {
          actualProviderId = prov.id;
        }
      }
      
      if (!actualProviderId) return [];
      
      // Filter by provider and deduplicate by ID
      const filtered = allCategories.filter(c => c.provider_id === actualProviderId);
      const uniqueCategories = Array.from(
        new Map(filtered.map(cat => [cat.id, cat])).values()
      );
      return uniqueCategories;
    } catch (e) {
      console.error('Error loading cached categories:', e);
    }
    return [];
  };

  const {
    data: categories = []
  } = useQuery<Category[]>({
    queryKey: ['categories', provider],
    queryFn: async () => {
      // Try cache first for offline
      const cachedCategories = getCachedCategories();
      
      // If offline, return cache
      if (!isReallyOnline) {
        return cachedCategories;
      }
      
      // If online but no providerId yet, return cache temporarily
      if (!providerId) {
        return cachedCategories;
      }
      
      // If online, try to fetch from network
      try {
        const {
          data,
          error
        } = await supabase.rpc('get_active_categories', {
          provider_uuid: providerId || null
        });
        
        if (error) {
          return cachedCategories;
        }
        
        const uniqueData = Array.from(
          new Map((data || []).map((cat: Category) => [cat.id, cat])).values()
        );
        return uniqueData as Category[];
      } catch (err) {
        return cachedCategories;
      }
    },
    // Load cached data immediately on mount (no waiting for async)
    initialData: () => getCachedCategories(),
    enabled: !!provider,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    retry: false
  });

  const getBrandBorderClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'border-hormuud';
      case 'somtel':
        return 'border-somtel';
      case 'somlink':
        return 'border-somlink';
      case 'somnet':
        return 'border-somnet';
      case 'amtel':
        return 'border-amtel';
      default:
        return 'border-primary';
    }
  };
  const handleCategoryClick = (categoryId: string) => {
    // Use providerId (UUID) for navigation instead of provider (which might be name)
    const navProviderId = providerId || provider;
    
    // Get category name to pass through
    const category = categories.find(c => c.id === categoryId);
    const categoryName = category?.category_name || '';

    // Always go to packages page first (both online and offline)
    // User needs to see packages before proceeding to payment
    navigate(`/packages/${navProviderId}`, {
      state: {
        providerName,
        selectedCategoryId: categoryId,
        categoryName, // Pass category name for ADSL detection
        // Pass offline context so payment page knows later
        senderPhone,
        receiverPhone,
        isOffline
      }
    });
  };

  const handleChangeOfflineNumbers = () => {
    navigate('/offline-mode');
  };

  // Get category icon based on category name
  const getCategoryIcon = (categoryName: string, colorClass: string) => {
    const lowerName = categoryName.toLowerCase();
    const iconClass = `w-8 h-8 ${colorClass} animate-pulse-glow`;
    
    if (lowerName.includes('maalinle')) {
      return <Sun className={iconClass} />;
    }
    if (lowerName.includes('isbuucle')) {
      return <CalendarDays className={iconClass} />;
    }
    if (lowerName.includes('bille')) {
      return <CalendarRange className={iconClass} />;
    }
    if (lowerName.includes('no expire') || lowerName.includes('expire')) {
      return <Infinity className={iconClass} />;
    }
    // Default fallback
    return <Wifi className={iconClass} />;
  };

  // Get saved offline numbers from localStorage
  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';
  return <div className="min-h-screen bg-background flex flex-col">
      {/* Blue Header - Fixed with safe-area padding for Android 12+ */}
      <div 
        className="fixed top-0 left-0 right-0 z-50" 
        style={{
          backgroundColor: '#0099ff',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
          boxSizing: 'border-box' as const
        }}
      >
        <div className="text-white p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ArrowLeft className="w-6 h-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/providers')} aria-label="Go back" />
              <h1 className="text-lg font-semibold">Iftin Internet - {providerName}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-3 ml-2">
                <Phone className="w-6 h-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open('tel:+252617195659', '_self')} />
                <MessageCircle className="w-6 h-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open('https://wa.link/ake9qi', '_blank')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content with top padding for fixed header + safe-area */}
      <div 
        className="flex-1"
        style={{ 
          paddingTop: 'calc(5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' 
        }}
      >
        {/* Rotating Banner Section */}
        <div className="px-4 pt-1 pb-4">
          <RotatingBanner />
        </div>

        {/* Main Content */}
        <div className="p-4 space-y-6">
          {/* Category Selection */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Dooro Nooca Internet-ka
            </h2>
            
            <div className="grid grid-cols-3 gap-3">
              {categories.map((category, index) => (
                <button 
                  key={category.id} 
                  onClick={() => handleCategoryClick(category.id)} 
                  className={`bg-white border ${getBrandBorderClass(providerName)} rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-transform hover:shadow-md h-28 w-full flex flex-col items-center justify-center gap-1`}
                >
                  <div 
                    className="w-12 h-12 flex-shrink-0 flex items-center justify-center animate-bounce-in opacity-0"
                    style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                  >
                    {category.category_image ? (
                      <img 
                        src={category.category_image} 
                        alt={category.category_name} 
                        className="w-12 h-12 object-contain" 
                        loading="eager" 
                        decoding="sync"
                        fetchPriority="high"
                      />
                    ) : (
                      getCategoryIcon(category.category_name, getBrandBorderClass(providerName).replace('border-', 'text-'))
                    )}
                  </div>
                  <span className="text-foreground text-center px-2 text-[10px] font-semibold line-clamp-2 leading-tight max-w-full">
                    {category.category_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Change Offline Numbers Button - Only show in offline mode */}
      {isOffline && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pb-2">
          <Button
            onClick={handleChangeOfflineNumbers}
            className="w-full bg-white hover:bg-white/90 text-[#0099ff] border-2 border-[#0099ff] shadow-lg font-semibold"
            size="lg"
          >
            <Edit className="w-5 h-5 mr-2" />
            Badal Lambarka
          </Button>
        </div>
      )}

      {/* Bottom Navigation - Fixed */}
      <BottomNavigation />
    </div>;
};
export default CategorySelection;