import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, Wifi } from 'lucide-react';
import { Card } from './ui/card';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '@/lib/utils';
import { useConnectivity } from '@/contexts/ConnectivityContext';

interface PopularPackage {
  package_id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  provider_id: string;
  provider_name: string;
  provider_logo: string;
  connection_type_label: string;
  display_order?: number;
  purchase_count?: number;
}

const PopularPackages = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();

  // Realtime subscription for featured_packages changes
  useEffect(() => {
    const channel = supabase
      .channel('featured-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'featured_packages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['popularPackages'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_packages_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['popularPackages'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);
  
  // Check if featured packages should be shown
  const { data: showFeatured = true } = useQuery({
    queryKey: ['showFeaturedPackages'],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('app_settings_show_featured');
        return cached ? JSON.parse(cached) : true;
      }
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'show_featured_packages')
        .maybeSingle();
      if (error) return true;
      
      const value = data?.setting_value ?? true;
      localStorage.setItem('app_settings_show_featured', JSON.stringify(value));
      return value;
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  // Check source: 'featured' or 'most_purchased'
  const { data: packageSource = 'featured' } = useQuery({
    queryKey: ['popularPackagesSource'],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('app_settings_package_source');
        return cached ? JSON.parse(cached) : 'featured';
      }
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('text_value')
        .eq('setting_key', 'popular_packages_source')
        .maybeSingle();
      if (error) return 'featured';
      
      const value = (data?.text_value as 'featured' | 'most_purchased') ?? 'featured';
      localStorage.setItem('app_settings_package_source', JSON.stringify(value));
      return value;
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  const { data: popularPackages = [], isLoading: packagesLoading } = useQuery({
    queryKey: ['popularPackages', packageSource],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_featured_packages');
        return cached ? JSON.parse(cached) : [];
      }
      
      const rpcFunction = packageSource === 'most_purchased' 
        ? 'get_most_purchased_packages' 
        : 'get_featured_packages';
      const { data, error } = await supabase.rpc(rpcFunction);
      if (error) throw error;
      return (data || []) as unknown as PopularPackage[];
    },
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    enabled: showFeatured,
    retry: false,
    initialData: () => {
      try {
        const cached = localStorage.getItem('offline_featured_packages');
        return cached ? JSON.parse(cached) : [];
      } catch (e) {
        return [];
      }
    },
  });

  const handlePackageClick = (pkg: PopularPackage) => {
    navigate(`/packages/${pkg.provider_id}`, { 
      state: { 
        providerName: pkg.provider_name,
        selectedPackageId: pkg.package_id 
      } 
    });
  };

  if (!showFeatured) return null;

  // Show skeleton while loading for new users
  if (packagesLoading && popularPackages.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
                <div className="h-5 w-12 bg-muted rounded" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (popularPackages.length === 0) return null;

  return (
    <div className={`space-y-3 ${!isReallyOnline ? 'blur-sm pointer-events-none opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          {packageSource === 'most_purchased' ? 'Xirmooyinka ugu Caansan' : 'Xirmooyinka La Doortay'}
        </h2>
      </div>
      
      <div className="space-y-2">
        {popularPackages.map((pkg, idx) => (
          <Card 
            key={`${pkg.package_id}-${pkg.provider_id}-${idx}`}
            className="p-3 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handlePackageClick(pkg)}
          >
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {pkg.provider_logo && (
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white">
                    <img
                      src={pkg.provider_logo}
                      alt={pkg.provider_name}
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wifi className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <p className="font-semibold text-sm text-foreground truncate">
                      {pkg.data_amount}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {pkg.provider_name} - {pkg.package_name}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="font-bold text-primary text-sm whitespace-nowrap">${formatPrice(pkg.selling_price)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PopularPackages;
