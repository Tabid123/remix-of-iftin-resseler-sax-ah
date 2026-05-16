import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { StatusBarColor } from "@/components/StatusBarColor";
import { ConnectivityProvider } from "@/contexts/ConnectivityContext";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useGlobalImagePreloader } from "@/hooks/useGlobalImagePreloader";
import { useEdgeToEdge } from "@/hooks/useEdgeToEdge";
import { useKeyboardInsets } from "@/hooks/useKeyboardInsets";
import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { useAutoOnlineRedirect } from "@/hooks/useAutoOnlineRedirect";
import { usePendingIntentSync } from "@/hooks/usePendingIntentSync";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import ProviderSelection from "./pages/ProviderSelection";
// Categories / Packages / Payment routes removed — app is now jumlo-only
// OfflineMode page removed
import PaymentSuccess from "./pages/PaymentSuccess";
import OrderHistory from "./pages/OrderHistory";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import DownloadApp from "./pages/DownloadApp";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      refetchOnReconnect: true,
    },
  },
});

const hasRenderedDomContent = () => {
  const root = document.getElementById("root");
  if (!root) return false;
  if (document.getElementById("app-render-sentinel")) return true;
  const text = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return root.childElementCount > 0 && text.length > 0;
};

const forceFullPageReload = (reason: string) => {
  console.warn("[App Resume Watchdog] full reload:", reason);
  window.location.href = window.location.href;
};

const AppContent = () => {
  useOfflineCache();
  useGlobalImagePreloader();
  useEdgeToEdge();
  useKeyboardInsets(); // Fix Android 15+ keyboard navigation bar issue
  useAutoOnlineRedirect(); // Auto-redirect to online mode when connectivity is restored
  usePendingIntentSync(); // Background sweeper for failed pending intents
  const { showExitDialog, handleExitApp, handleCancelExit } = useAndroidBackButton();
  
  // Remove anti-flash style AFTER React has fully rendered
  useEffect(() => {
    // Wait for next frame to ensure DOM is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('anti-flash')?.remove();
      });
    });
  }, []);
  
  return (
    <>
      <div id="app-render-sentinel" hidden aria-hidden="true" />
      <StatusBarColor />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/providers" element={<ProtectedRoute><ProviderSelection /></ProtectedRoute>} />
        {/* /offline-mode route removed */}
        {/* Removed: /categories, /packages, /payment — app is now jumlo-only */}
        
        <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      
      {/* Exit App Confirmation Dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={handleCancelExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ka bax App-ka?</AlertDialogTitle>
            <AlertDialogDescription>
              Ma hubtaa inaad rabto inaad ka baxdo Iftin Internet app-ka?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelExit}>Maya</AlertDialogCancel>
            <AlertDialogAction onClick={handleExitApp}>Haa, Ka bax</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const App = () => {
  useEffect(() => {
    const LAST_ACTIVE_KEY = "__iftin_last_active_at__";
    let reloadStarted = false;

    const reloadOnce = (reason: string) => {
      if (reloadStarted) return;
      reloadStarted = true;
      forceFullPageReload(reason);
    };

    const saveLastActive = () => {
      try { sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch {}
    };

    const checkRenderedAfterResume = (reason: string) => {
      window.setTimeout(() => {
        if (!hasRenderedDomContent()) reloadOnce(reason);
      }, 500);
    };

    // Skip aggressive resume-reload on admin routes (state loss is too disruptive)
    const isAdminRoute = () => {
      try { return window.location.pathname.startsWith('/admin'); } catch { return false; }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveLastActive();
        return;
      }

      if (document.visibilityState === "visible") {
        if (isAdminRoute()) return; // Don't auto-reload admin pages

        let wasInactiveFor = 0;
        try {
          const lastActive = Number(sessionStorage.getItem(LAST_ACTIVE_KEY) || "0");
          wasInactiveFor = lastActive ? Date.now() - lastActive : 0;
        } catch {}

        if (wasInactiveFor > 10_000) {
          reloadOnce(`resume-after-${Math.round(wasInactiveFor / 1000)}s`);
          return;
        }

        checkRenderedAfterResume("visible-without-dom-content");
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (isAdminRoute()) return; // Don't auto-reload admin pages
      if (event.persisted) {
        reloadOnce("bfcache-restore");
        return;
      }
      checkRenderedAfterResume("pageshow-without-dom-content");
    };

    saveLastActive();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppContent />
              </BrowserRouter>
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ConnectivityProvider>
    </QueryClientProvider>
  );
};

export default App;
