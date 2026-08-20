import { useState } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Package,
  Smartphone,
  Send,
  CreditCard,
  ImageIcon,
  MessageSquare,
  DollarSign,
  ChevronRight,
  LogOut,
  Building2,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSelector from '@/components/LanguageSelector';
import ThemeToggle from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

export interface ResellerNavItem {
  value: string;
  title: string;
  titleSo: string;
  icon: any;
}

export interface ResellerNavGroup {
  label: string;
  labelSo: string;
  icon: any;
  items: ResellerNavItem[];
}

export const RESELLER_GROUPS: ResellerNavGroup[] = [
  {
    label: 'Payments & Analytics',
    labelSo: 'Lacagaha & Falanqayn',
    icon: BarChart3,
    items: [
      { value: 'transactions-dashboard', title: 'Transactions', titleSo: 'Transactions', icon: BarChart3 },
      { value: 'sms-payments', title: 'SMS Payments', titleSo: 'SMS Lacago', icon: MessageSquare },
      { value: 'payment', title: 'Payment Providers', titleSo: 'Payment', icon: CreditCard },
    ],
  },
  {
    label: 'Orders',
    labelSo: 'Dalabyo',
    icon: ShoppingCart,
    items: [
      { value: 'daily-orders', title: "Today's Orders", titleSo: 'Dalabyada Maalinta', icon: ShoppingCart },
    ],
  },
  {
    label: 'Packages',
    labelSo: 'Badeecadaha',
    icon: Package,
    items: [
      { value: 'wholesale-tiers', title: 'Wholesale Tiers', titleSo: 'Jumlo Tiers', icon: DollarSign },
    ],
  },
  {
    label: 'Devices & Delivery',
    labelSo: 'Aaladaha & Delivery',
    icon: Smartphone,
    items: [
      { value: 'devices', title: 'Devices', titleSo: 'Devices', icon: Smartphone },
    ],
  },
  {
    label: 'Communication',
    labelSo: 'Xiriirka',
    icon: Send,
    items: [
      { value: 'send-notification', title: 'Send Notification', titleSo: 'Fariin Dir', icon: Send },
      { value: 'banners', title: 'Banners', titleSo: 'Banners', icon: ImageIcon },
    ],
  },
];

export const RESELLER_TABS = [
  'dashboard',
  ...RESELLER_GROUPS.flatMap((g) => g.items.map((i) => i.value)),
];

interface Props {
  activeTab: string;
  onTabChange: (v: string) => void;
  onLogout: () => void;
}

export function ResellerSidebar({ activeTab, onTabChange, onLogout }: Props) {
  const { tenant, logoUrl } = useTenant();
  const { language } = useLanguage();
  const so = language === 'so';
  const [open, setOpen] = useState<string[]>(
    RESELLER_GROUPS.filter((g) => g.items.some((i) => i.value === activeTab)).map((g) => g.label)
  );

  const toggle = (label: string) =>
    setOpen((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-5">
        {logoUrl ? (
          <img src={logoUrl} alt={`${tenant?.name ?? 'Workspace'} logo`} className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/40" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/40">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{tenant?.name ?? 'Reseller'}</p>
          <p className="flex items-center gap-1.5 text-sm text-primary">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {tenant?.role ? tenant.role.charAt(0).toUpperCase() + tenant.role.slice(1) : 'Owner'}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <button
          onClick={() => onTabChange('dashboard')}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
            activeTab === 'dashboard' ? 'bg-primary text-primary-foreground' : 'hover:bg-sidebar-accent'
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </button>

        {RESELLER_GROUPS.map((group) => {
          const Icon = group.icon;
          const isOpen = open.includes(group.label);
          return (
            <div key={group.label}>
              <button
                onClick={() => toggle(group.label)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-sidebar-accent"
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 text-left">{so ? group.labelSo : group.label}</span>
                <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
              </button>
              {isOpen && (
                <div className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.value}
                        onClick={() => onTabChange(item.value)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          activeTab === item.value
                            ? 'bg-primary/15 font-semibold text-primary'
                            : 'hover:bg-sidebar-accent'
                        )}
                      >
                        <ItemIcon className="h-4 w-4" />
                        {so ? item.titleSo : item.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="my-3 border-t border-sidebar-border" />

        <NavLink
          to="/admin"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LayoutDashboard className="h-5 w-5" />
          Full Admin Dashboard
        </NavLink>

        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5" />
          {so ? 'Ka bax' : 'Logout'}
        </button>
      </nav>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <LanguageSelector />
        <ThemeToggle />
      </div>
    </div>
  );
}