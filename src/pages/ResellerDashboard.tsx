import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, PanelLeft, RefreshCw, Volume2, AlertTriangle, Home, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/contexts/TenantContext';
import { ResellerSidebar, RESELLER_GROUPS } from '@/components/reseller/ResellerSidebar';
import { ResellerStatCards } from '@/components/reseller/ResellerStatCards';

const TransactionsDashboard = lazy(() => import('@/components/admin/TransactionsDashboard').then(m => ({ default: m.TransactionsDashboard })));
const PaymentSmsLog = lazy(() => import('@/components/admin/PaymentSmsLog').then(m => ({ default: m.PaymentSmsLog })));
const WholesaleTiersManager = lazy(() => import('@/components/admin/WholesaleTiersManager'));
const DailyOrdersManager = lazy(() => import('@/components/admin/DailyOrdersManager').then(m => ({ default: m.DailyOrdersManager })));
const SendNotification = lazy(() => import('@/components/admin/SendNotification').then(m => ({ default: m.SendNotification })));
const DeviceManagement = lazy(() => import('@/components/admin/DeviceManagement').then(m => ({ default: m.DeviceManagement })));
const ResellerPaymentProviders = lazy(() => import('@/components/reseller/ResellerPaymentProviders'));
const ResellerBanners = lazy(() => import('@/components/reseller/ResellerBanners'));

const TabLoader = () => (
  <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

const LiveClock = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = now.toLocaleTimeString('en-US', {
    timeZone: 'Africa/Mogadishu',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div className="rounded-lg bg-primary-foreground/15 px-4 py-1.5 font-mono text-lg font-bold tracking-widest text-primary-foreground">
      {text}
    </div>
  );
};

const tabLabel = (value: string, so: boolean) => {
  if (value === 'dashboard') return 'Dashboard';
  for (const g of RESELLER_GROUPS) {
    const item = g.items.find((i) => i.value === value);
    if (item) return so ? item.titleSo : item.title;
  }
  return value;
};

export default function ResellerDashboard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const so = language === 'so';
  const { tenant, logoUrl } = useTenant();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/admin/login'); return; }
      setChecking(false);
    };
    check();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const changeTab = (v: string) => {
    setActiveTab(v);
    setMobileOpen(false);
  };

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
        <div className="sticky top-0 h-screen">
          <ResellerSidebar activeTab={activeTab} onTabChange={changeTab} onLogout={handleLogout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Brand bar */}
        <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
          {logoUrl && <img src={logoUrl} alt={`${tenant?.name ?? 'Reseller'} logo`} className="h-9 w-9 rounded-lg object-cover" />}
          <span className="text-xl font-bold text-primary-foreground">{tenant?.name ?? 'Reseller'}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold text-primary-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> LIVE
          </span>
        </div>

        {/* Toolbar */}
        <header className="flex items-center gap-3 bg-gradient-to-r from-blue-700 to-blue-600 px-3 py-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15 md:hidden">
                <PanelLeft className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <ResellerSidebar activeTab={activeTab} onTabChange={changeTab} onLogout={handleLogout} />
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 justify-center"><LiveClock /></div>

          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15" onClick={() => changeTab('sms-payments')}>
            <AlertTriangle className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15" onClick={() => changeTab('send-notification')}>
            <Volume2 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/15" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
            <Home className="h-4 w-4" />
            <button onClick={() => changeTab('dashboard')} className="hover:text-foreground">Home</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{tabLabel(activeTab, so)}</span>
          </nav>

          <Suspense fallback={<TabLoader />}>
            {activeTab === 'dashboard' && <ResellerStatCards key={refreshKey} onNavigate={changeTab} />}
            {activeTab === 'transactions-dashboard' && <TransactionsDashboard />}
            {activeTab === 'sms-payments' && <PaymentSmsLog />}
            {activeTab === 'payment' && <ResellerPaymentProviders />}
            {activeTab === 'daily-orders' && <DailyOrdersManager />}
            {activeTab === 'wholesale-tiers' && <WholesaleTiersManager />}
            {activeTab === 'devices' && <DeviceManagement />}
            {activeTab === 'sim-pins' && <ResellerSimPins />}
            {activeTab === 'send-notification' && <SendNotification />}
            {activeTab === 'banners' && <ResellerBanners />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}