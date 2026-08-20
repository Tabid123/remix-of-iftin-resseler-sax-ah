import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useBrand } from '@/hooks/useBrand';


const Index = () => {
  const navigate = useNavigate();
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  const [isChecking, setIsChecking] = useState(!wasAlreadyInitialized);
  const hasInitialized = useRef(false);
  const { isReallyOnline } = useConnectivity();
  const { forceRefreshCache } = useOfflineCache();
  const { tenant, logoUrl, name: brandName, primary: brandColor } = useBrand();

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
      style={{ backgroundColor: brandColor }}
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
