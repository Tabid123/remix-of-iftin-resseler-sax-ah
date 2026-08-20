import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useTenant } from '@/contexts/TenantContext';

// Darken a hex color by a ratio (0-1) for the splash gradient
const shadeHex = (hex: string, ratio = 0.3) => {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.round(v * (1 - ratio))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return `#${c}`;
};

const Index = () => {
  const navigate = useNavigate();
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  const [isChecking, setIsChecking] = useState(!wasAlreadyInitialized);
  const hasInitialized = useRef(false);
  const { isReallyOnline } = useConnectivity();
  const { forceRefreshCache } = useOfflineCache();
  const { tenant, logoUrl } = useTenant();
  const brandName = tenant?.name || 'Iftin Internet';
  const brandColor = tenant?.primary_color || '#0099ff';
  const brandColorDark = tenant?.primary_color ? shadeHex(tenant.primary_color, 0.35) : '#0066cc';

  // Background cache refresh (fire-and-forget)
  const splashRefreshDone = useRef(false);
  useEffect(() => {
    if (!splashRefreshDone.current && isReallyOnline && isChecking) {
      splashRefreshDone.current = true;
      try { Promise.resolve(forceRefreshCache()).catch(() => {}); } catch {}
    }
  }, [isReallyOnline, isChecking, forceRefreshCache]);

  // Skip splash if already initialized
  useEffect(() => {
    if (wasAlreadyInitialized) {
      navigate('/providers', { replace: true });
      return;
    }
    // First open: short splash then go to providers (no verification)
    const t = setTimeout(() => {
      hasInitialized.current = true;
      sessionStorage.setItem('appInitialized', 'true');
      setIsChecking(false);
      navigate('/providers', { replace: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [navigate, wasAlreadyInitialized]);

  if (!isChecking) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColorDark} 100%)` }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={`${brandName} logo`} className="w-36 h-36 rounded-3xl object-cover animate-pulse" />
      ) : tenant ? (
        <div className="w-36 h-36 rounded-3xl bg-white/20 flex items-center justify-center text-6xl font-extrabold text-white animate-pulse">
          {brandName.charAt(0).toUpperCase()}
        </div>
      ) : (
        <img src="/images/iftin-splash-logo.png" alt="Iftin Internet" className="w-36 h-36 animate-pulse" />
      )}
      <p className="mt-5 text-white text-lg font-extrabold tracking-tight">{brandName}</p>
      <div className="w-10 h-10 mt-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
};

export default Index;
