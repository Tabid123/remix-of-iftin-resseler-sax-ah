import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { ArrowRight, Loader2 } from 'lucide-react';

type Period = 'today' | 'week' | 'month' | 'total';

interface PeriodData {
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
  pending: number;
  failed: number;
  delivered: number;
}

const empty: PeriodData = { revenue: 0, cost: 0, profit: 0, orders: 0, pending: 0, failed: 0, delivered: 0 };

const mapPeriod = (p: any): PeriodData => ({
  revenue: Number(p?.revenue || 0),
  cost: Number(p?.cost || 0),
  profit: Number(p?.profit || 0),
  orders: Number(p?.orders || 0),
  pending: Number(p?.pending || 0),
  failed: Number(p?.failed || 0),
  delivered: Number(p?.delivered || 0),
});

interface Props {
  onNavigate: (tab: string) => void;
}

export function ResellerStatCards({ onNavigate }: Props) {
  const { language } = useLanguage();
  const so = language === 'so';
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<Period, PeriodData>>({
    today: empty, week: empty, month: empty, total: empty,
  });
  const [devicesOnline, setDevicesOnline] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [smsLogs, setSmsLogs] = useState(0);
  const [blocked, setBlocked] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [summaryRes, devRes, unmatchedRes, smsRes, blockedRes] = await Promise.all([
        supabase.rpc('get_admin_analytics_summary'),
        supabase.from('android_devices').select('id, last_ping_at').eq('is_active', true),
        supabase.from('payment_receipts').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'),
        supabase.from('payment_receipts').select('id', { count: 'exact', head: true }),
        supabase.from('blocked_users').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      const s = (summaryRes.data ?? {}) as any;
      setData({
        today: mapPeriod(s.today),
        week: mapPeriod(s.week),
        month: mapPeriod(s.month),
        total: {
          revenue: Number(s.total_revenue || 0),
          cost: Number(s.total_cost || 0),
          profit: Number(s.total_profit || 0),
          orders: Number(s.total_orders || 0),
          pending: Number(s.pending_orders || 0),
          failed: Number(s.failed_orders || 0),
          delivered: Number(s.delivered_orders || 0),
        },
      });

      const cutoff = Date.now() - 3 * 60 * 1000;
      setDevicesOnline(
        (devRes.data ?? []).filter((d: any) => d.last_ping_at && new Date(d.last_ping_at).getTime() > cutoff).length
      );
      setUnmatched(unmatchedRes.count ?? 0);
      setSmsLogs(smsRes.count ?? 0);
      setBlocked(blockedRes.count ?? 0);
      setLoading(false);
    };
    load();
  }, []);

  const d = data[period];

  const periods: { key: Period; label: string; labelSo: string }[] = [
    { key: 'today', label: 'Today', labelSo: 'Maanta' },
    { key: 'week', label: 'This week', labelSo: 'Isbuucan' },
    { key: 'month', label: 'This month', labelSo: 'Bisha' },
    { key: 'total', label: 'All time', labelSo: 'Sanadka' },
  ];

  const suffix = so
    ? periods.find((p) => p.key === period)!.labelSo
    : periods.find((p) => p.key === period)!.label;

  const cards = [
    {
      value: String(d.orders),
      title: so ? `Dalabyada ${suffix}` : `Orders ${suffix}`,
      sub: so ? `${d.failed} fashilmay · ${d.pending} sugaya` : `${d.failed} failed · ${d.pending} pending`,
      gradient: 'from-teal-400 to-emerald-500',
      footer: 'from-teal-600 to-emerald-700',
      tab: 'daily-orders',
    },
    {
      value: `$${d.revenue.toFixed(2)}`,
      title: so ? `Dakhliga ${suffix}` : `Revenue ${suffix}`,
      sub: so ? `${d.delivered} dalab la diray` : `${d.delivered} delivered`,
      gradient: 'from-rose-500 to-red-600',
      footer: 'from-rose-700 to-red-800',
      tab: 'transactions-dashboard',
    },
    {
      value: `$${d.profit.toFixed(2)}`,
      title: so ? `Faaiidada ${suffix}` : `Profit ${suffix}`,
      sub: so ? `Qarash: $${d.cost.toFixed(2)}` : `Cost: $${d.cost.toFixed(2)}`,
      gradient: 'from-green-500 to-emerald-600',
      footer: 'from-green-700 to-emerald-800',
      tab: 'transactions-dashboard',
    },
    {
      value: String(unmatched),
      title: 'Unmatched',
      sub: so ? `${unmatched} unmatched · ${d.failed} fashilmay` : `${unmatched} unmatched · ${d.failed} failed`,
      gradient: 'from-blue-500 to-blue-600',
      footer: 'from-blue-700 to-blue-800',
      tab: 'sms-payments',
    },
    {
      value: String(smsLogs),
      title: so ? 'SMS Lacago' : 'SMS Payments',
      sub: so ? 'Dhammaan lacagaha SMS' : 'All SMS receipts',
      gradient: 'from-pink-500 to-fuchsia-600',
      footer: 'from-pink-700 to-fuchsia-800',
      tab: 'sms-payments',
    },
    {
      value: String(devicesOnline),
      title: so ? 'Aaladaha Online' : 'Devices Online',
      sub: so ? 'Heartbeat 3 daqiiqo' : 'Heartbeat 3 min',
      gradient: 'from-amber-400 to-yellow-500',
      footer: 'from-amber-600 to-yellow-700',
      tab: 'devices',
    },
    {
      value: String(blocked),
      title: so ? 'Users Xidhan' : 'Blocked Users',
      sub: so ? 'Liiska madow' : 'Blacklist',
      gradient: 'from-slate-600 to-slate-700',
      footer: 'from-slate-800 to-slate-900',
      tab: 'transactions-dashboard',
    },
    {
      value: `$${d.cost.toFixed(2)}`,
      title: so ? 'Qarashka' : 'Cost',
      sub: so ? 'Qiimaha iibsiga' : 'Purchase cost',
      gradient: 'from-indigo-500 to-violet-600',
      footer: 'from-indigo-700 to-violet-800',
      tab: 'wholesale-tiers',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              period === p.key
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            )}
          >
            {so ? p.labelSo : p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {cards.map((c) => (
            <button
              key={c.title}
              onClick={() => onNavigate(c.tab)}
              className={cn(
                'overflow-hidden rounded-2xl text-left shadow-lg transition-transform hover:scale-[1.02]',
                'bg-gradient-to-br',
                c.gradient
              )}
            >
              <div className="px-3 py-5 text-center text-primary-foreground sm:px-5 sm:py-6">
                <p className="text-2xl font-extrabold drop-shadow-sm sm:text-4xl">{c.value}</p>
                <p className="mt-1 text-sm font-semibold sm:text-lg">{c.title}</p>
                <p className="mt-1 text-[11px] opacity-90 sm:text-xs">{c.sub}</p>
              </div>
              <div className={cn('flex items-center justify-center gap-2 bg-gradient-to-r py-2.5 text-xs font-medium text-primary-foreground sm:py-3 sm:text-sm', c.footer)}>
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> More Info
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}