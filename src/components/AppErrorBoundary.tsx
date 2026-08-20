import React from 'react';

interface State {
  hasError: boolean;
  error?: Error;
}

const splashBackground: React.CSSProperties = {
  backgroundColor: '#0066cc',
};

const RELOAD_KEY = '__iftin_boundary_reloads__';
const LAST_RELOAD_KEY = '__iftin_boundary_last_reload__';
const MAX_RELOADS_PER_WINDOW = 3;
const RELOAD_WINDOW_MS = 60_000; // 1 dakiiqo — kadib counter-ka dib loo dejiyo

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info);
    // Silent auto-reload with sliding window: max 3 reloads per minute, then stop to avoid loops.
    try {
      const now = Date.now();
      const last = parseInt(sessionStorage.getItem(LAST_RELOAD_KEY) || '0', 10);
      // Hadii in ka badan 1 dakiiqo soo dhaaftay, counter-ka dib u deji
      let n = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      if (now - last > RELOAD_WINDOW_MS) n = 0;

      if (n < MAX_RELOADS_PER_WINDOW) {
        sessionStorage.setItem(RELOAD_KEY, String(n + 1));
        sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
        // Sii fursad inay React umount sameyso oo splash uu daabaco
        setTimeout(() => {
          try { window.location.reload(); } catch {}
        }, 1200);
      }
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // No error message — just show the same splash (logo + spinner) so the user
    // never sees a "didn't load" screen. We auto-reload silently in the background.
    return (
      <div
        style={{
          ...splashBackground,
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          color: '#ffffff',
          zIndex: 9999,
        }}
      >
        <img
          src="/images/iftin-splash-logo.png"
          alt="Iftin Internet"
          style={{
            width: 150,
            height: 150,
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: 40,
            height: 40,
            marginTop: 40,
            border: '4px solid rgba(255,255,255,0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
        `}</style>
      </div>
    );
  }
}

export default AppErrorBoundary;
