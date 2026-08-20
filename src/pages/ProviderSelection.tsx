import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  User,
  Search,
  WifiOff,
  RefreshCw,
  Phone,
  MessageCircle,
  X,
} from 'lucide-react';
import { JumloFlow } from '@/components/JumloFlow';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { BottomNavigation } from '@/components/BottomNavigation';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useTenant } from '@/contexts/TenantContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
}

// Brand colors per spec
const PROVIDER_COLORS: Record<string, { bg: string; ring: string }> = {
  hormuud: { bg: '#1a8a2e', ring: '#1a8a2e' },
  somtel:  { bg: '#e6a800', ring: '#e6a800' },
  somlink: { bg: '#cc2200', ring: '#cc2200' },
  somnet:  { bg: '#0055cc', ring: '#0055cc' },
  amtel:   { bg: '#8800cc', ring: '#8800cc' },
};

const HEADER_BLUE = '#0066CC';
const HEADER_BLUE_DARK = '#004fa3';

// Darken a hex color by a ratio (0-1) for the header gradient
const shadeHex = (hex: string, ratio = 0.25) => {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.round(v * (1 - ratio))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return `#${c}`;
};

const getProviderColor = (name: string) => {
  const key = name?.toLowerCase().trim();
  return PROVIDER_COLORS[key] || { bg: '#0066CC', ring: '#0066CC' };
};

const getInitials = (name: string) => {
  if (!name) return '?';
  const clean = name.trim().toUpperCase();
  return clean.slice(0, 3);
};

// Detect provider id from receiver prefix (kept from old logic)
const detectProvider = (phone: string): { id: string; name: string } | null => {
  if (phone.length < 2) return null;
  const prefix = phone.substring(0, 2);
  const map: Record<string, { id: string; name: string }> = {
    '61': { id: 'hormuud', name: 'Hormuud' },
    '68': { id: 'somnet', name: 'Somnet' },
    '62': { id: 'somtel', name: 'Somtel' },
    '71': { id: 'amtel', name: 'Amtel' },
    '64': { id: 'somlink', name: 'Somlink' },
  };
  return map[prefix] || null;
};

// Format raw digits as "61 XXX XXXX"
const formatPhoneDisplay = (digits: string) => {
  const d = digits.replace(/\D/g, '').slice(0, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
};

const ProviderSelection = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();

  const [search, setSearch] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [jumloOpen, setJumloOpen] = useState(false);

  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);

  // Pull-to-refresh
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    showBannerAd();
    logScreenView('ProviderSelection');
    return () => { hideBannerAd(); };
  }, []);

  // Realtime providers
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel('providers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'providers_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['providers'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: async () => {
      if (isReallyOnline === false) {
        const cached = localStorage.getItem('offline_providers');
        return cached ? JSON.parse(cached) : [];
      }
      const { data, error } = await supabase.rpc('get_active_providers');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    retry: false,
    initialData: () => {
      try {
        const cached = localStorage.getItem('offline_providers');
        return cached ? JSON.parse(cached) : [];
      } catch { return []; }
    },
  });

  // Prefetch categories + per-provider packages (preserved)
  useEffect(() => {
    if (!providers.length) return;
    queryClient.prefetchQuery({
      queryKey: ['categories'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_active_categories');
        if (error) throw error;
        return data || [];
      },
      staleTime: 30 * 1000,
    });
    providers.forEach((p) => {
      queryClient.prefetchQuery({
        queryKey: ['packages', p.id],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('get_public_packages', { provider_uuid: p.id });
          if (error) throw error;
          return data || [];
        },
        staleTime: 30 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: ['promotionalText', p.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('providers_config')
            .select('promotional_text')
            .eq('id', p.id)
            .maybeSingle();
          if (error) throw error;
          return data?.promotional_text || 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!';
        },
        staleTime: 30 * 1000,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  // (auto-detect by phone removed — user picks provider directly to open Jumlo flow)

  // Pull to refresh handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['providers'] });
      await queryClient.invalidateQueries({ queryKey: ['featuredPackages'] });
      await queryClient.invalidateQueries({ queryKey: ['banners'] });
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [queryClient]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    if (distance > 0 && contentRef.current?.scrollTop === 0) {
      setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) handleRefresh();
    else setPullDistance(0);
    setIsPulling(false);
  }, [pullDistance, isRefreshing, handleRefresh]);

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.provider_name.toLowerCase().includes(q));
  }, [providers, search]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  // Tenant (reseller) branding — falls back to default app brand
  const { logoUrl, name: brandName, primary: brandColor, primaryDark: brandColorDark } = useBrand();

  const handleProviderSelect = (p: Provider) => {
    if (isReallyOnline === false) {
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 3000);
      return;
    }
    setSelectedProviderId(p.id);
    setJumloOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f7fa]">
      {/* HEADER */}
      <div
        className="fixed top-0 left-0 right-0 z-40"
        style={{
          background: `linear-gradient(180deg, ${brandColor} 0%, ${brandColorDark} 100%)`,
          paddingTop: 'var(--effective-safe-area-top, 0px)',
        }}
      >
        <div className="px-4 pt-3 pb-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${brandName} logo`}
                  className="h-10 w-10 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-lg font-extrabold">
                  {brandName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-lg font-extrabold tracking-tight">{brandName}</h1>
                <p className="truncate text-[11px] font-medium text-white/70">Internet Marketplace</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                aria-label="Notifications"
                onClick={() => navigate('/notifications')}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
              >
                <Bell className="w-5 h-5 text-white" />
              </button>
              <button
                aria-label="Profile"
                onClick={() => navigate('/profile')}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
              >
                <User className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'calc(5.25rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull indicator */}
        <div
          className="flex items-center justify-center transition-all duration-200"
          style={{
            height: pullDistance > 0 ? `${pullDistance}px` : 0,
            opacity: pullDistance > 20 ? 1 : 0,
          }}
        >
          <RefreshCw
            className={`w-5 h-5 text-[${HEADER_BLUE}] ${isRefreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${pullDistance * 2}deg)`, color: HEADER_BLUE }}
          />
        </div>

        {/* OFFLINE TOAST */}
        {showOfflineToast && (
          <div className="mx-4 mt-2 p-3 bg-amber-100 border border-amber-500 rounded-xl flex items-start gap-2 animate-in slide-in-from-top">
            <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Internet ma hayso!</p>
              <p className="text-sm text-amber-700 mt-1">Fadlan isticmaal Offline Mode.</p>
            </div>
          </div>
        )}

        {/* BANNER */}
        <div className="px-4 pt-4">
          <div
            className="relative overflow-hidden rounded-2xl text-white p-5 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${HEADER_BLUE} 0%, #1a8cff 50%, #4dabff 100%)`,
              minHeight: '140px',
            }}
          >
            {/* Decorative circles */}
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
            <div className="absolute right-12 top-8 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -right-4 bottom-2 w-16 h-16 rounded-full bg-white/5" />

            <div className="relative">
              <span className="inline-block bg-white/25 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1 rounded-full">
                Cusub
              </span>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight">
                Xirmo Tayo Sare
                <br />
                Qiimo Jaban
              </h2>
              <p className="mt-1 text-white/85 text-sm font-medium">
                Offline xitaa u shaqeeya
              </p>

              {/* Dots */}
              <div className="mt-4 flex items-center gap-1.5">
                <span className="block h-1.5 w-5 rounded-full bg-white" />
                <span className="block h-1.5 w-1.5 rounded-full bg-white/50" />
                <span className="block h-1.5 w-1.5 rounded-full bg-white/50" />
              </div>
            </div>
          </div>
        </div>

        {/* PROVIDERS */}
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Shirkadaha</h3>
            <button
              className="text-sm font-semibold"
              style={{ color: HEADER_BLUE }}
              onClick={() => setSearch('')}
            >
              Dhammaan
            </button>
          </div>

          <div className="mt-3 -mx-4 px-4 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {filteredProviders.map((p) => {
              const colors = getProviderColor(p.provider_name);
              const isSelected = selectedProviderId === p.id;
              const offline = isReallyOnline === false;
              return (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p)}
                  disabled={offline}
                  className={`shrink-0 w-20 flex flex-col items-center gap-2 rounded-2xl p-2 transition-all ${
                    isSelected
                      ? 'bg-blue-50 ring-2'
                      : 'bg-white ring-1 ring-gray-200 hover:ring-gray-300'
                  } ${offline ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={isSelected ? { boxShadow: `0 0 0 2px ${HEADER_BLUE}` } : undefined}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[11px] font-extrabold tracking-wide shadow-sm"
                    style={{ backgroundColor: colors.bg }}
                  >
                    {getInitials(p.provider_name)}
                  </div>
                  <span className="text-xs font-medium text-gray-800 truncate w-full text-center">
                    {p.provider_name}
                  </span>
                </button>
              );
            })}

            {filteredProviders.length === 0 && (
              <p className="text-sm text-gray-500 py-4">Shirkad lama helin.</p>
            )}
          </div>
        </div>

        {/* HINT */}
        <div className="px-4 pt-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-gray-100 text-center">
            <p className="text-sm text-gray-600">
              Dooro shirkad kor ka mid ah si aad u bilowdo iibinta jumlo.
            </p>
          </div>
        </div>

        <div className="h-6" />
      </div>

      {/* Jumlo flow modal */}
      {selectedProvider && (
        <JumloFlow
          open={jumloOpen}
          onClose={() => setJumloOpen(false)}
          providerId={selectedProvider.id}
          providerName={selectedProvider.provider_name}
          brandColor={getProviderColor(selectedProvider.provider_name).bg}
        />
      )}

      {/* Floating Support FAB */}
      <button
        onClick={() => setShowContactSheet(!showContactSheet)}
        className={`fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all duration-300 ${
          showContactSheet ? 'bg-red-500' : ''
        }`}
        style={!showContactSheet ? { backgroundColor: HEADER_BLUE } : undefined}
      >
        {showContactSheet ? (
          <X className="w-7 h-7 text-white" />
        ) : (
          <>
            <Phone className="w-7 h-7 text-white" />
            <span
              className="absolute -top-1 -right-1 bg-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2"
              style={{ color: HEADER_BLUE, borderColor: HEADER_BLUE }}
            >
              24
            </span>
          </>
        )}
      </button>

      {showContactSheet && (
        <div className="fixed bottom-40 right-4 z-40 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <a
            href="tel:+252617195659"
            onClick={() => setShowContactSheet(false)}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            style={{ backgroundColor: HEADER_BLUE }}
          >
            <Phone className="w-7 h-7 text-white" />
          </a>
          <button
            onClick={() => setShowContactSheet(false)}
            className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <a
            href="https://wa.link/ake9qi"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setShowContactSheet(false)}
            className="w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <MessageCircle className="w-7 h-7 text-white" />
          </a>
        </div>
      )}

      <BottomNavigation />
    </div>
  );
};

export default ProviderSelection;
