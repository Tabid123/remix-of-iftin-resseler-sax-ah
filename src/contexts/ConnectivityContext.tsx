import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';

// TEMPORARY: Supabase xiran (Feb 22 ilaa), ping-ka Google/Cloudflare ku samee
// Si user-ku offline u noqon marka internet haysto laakiin Supabase xiran yahay
const PING_URLS = [
  'https://www.google.com/generate_204',
  'https://clients3.google.com/generate_204',
  'https://1.1.1.1/cdn-cgi/trace',
];

const pingServer = async (timeoutMs = 5000): Promise<boolean> => {
  if (!navigator.onLine) return false;
  
  // Try multiple endpoints - if ANY works, user has internet
  for (const url of PING_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        mode: 'no-cors', // Google/Cloudflare CORS ma ogola, laakiin opaque response = online
      });
      
      clearTimeout(timeoutId);
      // no-cors: response.type === 'opaque' means it reached the server = online
      return true;
    } catch {
      continue; // Try next URL
    }
  }
  return false;
};

interface ConnectivityContextType {
  isReallyOnline: boolean | null;
  isChecking: boolean;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const ConnectivityProvider = ({ children }: { children: ReactNode }) => {
  // Start with null = unknown, isChecking = true during splash
  const [connectivity, setConnectivity] = useState<{ isReallyOnline: boolean | null; isChecking: boolean }>(() => {
    // If browser says offline, we know for sure
    if (!navigator.onLine) {
      return { isReallyOnline: false, isChecking: false };
    }
    // Browser says online - need to verify with ping
    return { isReallyOnline: null, isChecking: true };
  });

  // Initial connectivity check at startup with HARD 2s timeout safety net
  useEffect(() => {
    let settled = false;
    
    const finalize = (isOnline: boolean) => {
      if (settled) return;
      settled = true;
      setConnectivity({ isReallyOnline: isOnline, isChecking: false });
      sessionStorage.setItem('connectivity_status', isOnline ? 'true' : 'false');
    };

    const checkConnectivity = async () => {
      // Haddii browser offline yahay, isla markiiba offline
      if (!navigator.onLine) {
        finalize(false);
        return;
      }
      
      // Single ping attempt - 1.5s timeout (faster splash exit)
      const isOnline = await pingServer(1500);
      finalize(isOnline);
    };

    // HARD SAFETY NET: 2s max - guarantees isChecking flips to false
    const hardTimeout = setTimeout(() => {
      // Default to navigator.onLine status if ping hangs
      finalize(navigator.onLine);
    }, 2000);

    if (connectivity.isChecking) {
      checkConnectivity().finally(() => clearTimeout(hardTimeout));
    } else {
      clearTimeout(hardTimeout);
    }
    
    return () => clearTimeout(hardTimeout);
  }, []);

  // Real-time event listeners - Offline user helay internet, isla markiiba online noqdo
  useEffect(() => {
    const handleOnline = async () => {
      // User got internet! Browser says online, trust it immediately
      // Isla markiiba online u dhig - ping background-ka ha ku samayso
      setConnectivity({ isReallyOnline: true, isChecking: false });
      sessionStorage.setItem('connectivity_status', 'true');
    };
    
    const handleOffline = () => {
      // Browser says offline - update immediately
      setConnectivity({ isReallyOnline: false, isChecking: false });
      sessionStorage.setItem('connectivity_status', 'false');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return (
    <ConnectivityContext.Provider value={connectivity}>
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return context;
};
