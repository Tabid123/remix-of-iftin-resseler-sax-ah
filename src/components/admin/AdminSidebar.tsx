import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Bell,
  Users,
  Package,
  ShoppingCart,
  Briefcase,
  Grid3x3,
  Star,
  DollarSign,
  CreditCard,
  ImageIcon,
  AlertTriangle,
  Smartphone,
  Settings,
  WifiOff,
  Send,
  MessageSquare,
  BarChart3,
  Receipt,
  Zap,
  PhoneCall,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { TenantSwitcher } from "@/components/tenant/TenantSwitcher";

interface NavItem {
  title: string;
  titleSo: string;
  value: string;
  icon: any;
  permission?: string; // which permission key is required; undefined = always visible or dashboard
}

const navItems: NavItem[] = [
  { title: "Dashboard", titleSo: "Dashboard", value: "dashboard", icon: LayoutDashboard },
  { title: "Transactions", titleSo: "💰 Transactions", value: "transactions-dashboard", icon: Receipt, permission: "view_transactions" },
  { title: "Send Notification", titleSo: "Farriin Dir", value: "send-notification", icon: Send, permission: "manage_settings" },
  { title: "Alerts", titleSo: "Farriin", value: "notifications", icon: Bell, permission: "manage_settings" },
  { title: "Online Payments", titleSo: "💳 Online Payments", value: "online-payments", icon: CreditCard, permission: "view_transactions" },
  { title: "WaafiPay (iPhone)", titleSo: "🍎 WaafiPay iPhone", value: "waafipay-orders", icon: CreditCard, permission: "view_transactions" },
  { title: "SMS Offline Orders", titleSo: "📲 SMS Dalabyo", value: "sms-offline-orders", icon: MessageSquare, permission: "manage_orders" },
  { title: "Combined Analytics", titleSo: "📊 Falanqayn", value: "combined-analytics", icon: BarChart3, permission: "view_transactions" },
  { title: "Users", titleSo: "📱 Macaamiisha", value: "users", icon: Users, permission: "manage_users" },
  { title: "Outreach", titleSo: "📞 Macaamiil-raadis", value: "outreach", icon: PhoneCall, permission: "manage_users" },
  { title: "Offline Registration", titleSo: "Offline Registration", value: "offline-registrations", icon: WifiOff, permission: "manage_users" },
  { title: "Delivery", titleSo: "📦 Dir", value: "delivery", icon: Package, permission: "manage_orders" },
  { title: "Daily Orders", titleSo: "📋 Dalabyada Maalinta", value: "daily-orders", icon: ShoppingCart, permission: "manage_orders" },
  { title: "Orders", titleSo: "Orders", value: "orders", icon: ShoppingCart, permission: "manage_orders" },
  { title: "SMS Payments", titleSo: "💰 SMS Lacago", value: "sms-payments", icon: MessageSquare, permission: "view_transactions" },
  { title: "Unmatched", titleSo: "⚠️ Unmatched", value: "unmatched", icon: AlertTriangle, permission: "view_transactions" },
  { title: "Providers", titleSo: "Shirkadaha", value: "providers", icon: Briefcase, permission: "manage_providers" },
  { title: "Packages", titleSo: "Packages", value: "packages", icon: Package, permission: "manage_packages" },
  { title: "Categories", titleSo: "Categories", value: "categories", icon: Grid3x3, permission: "manage_packages" },
  { title: "Featured", titleSo: "⭐ Featured", value: "featured", icon: Star, permission: "manage_packages" },
  { title: "Pricing", titleSo: "💰 Qiimaha", value: "pricing", icon: DollarSign, permission: "manage_packages" },
  { title: "Wholesale Tiers", titleSo: "📊 Jumlo Tiers", value: "wholesale-tiers", icon: DollarSign, permission: "manage_packages" },
  { title: "Payment", titleSo: "Payment", value: "payment", icon: CreditCard, permission: "manage_settings" },
  { title: "Offline Payment", titleSo: "📴 Offline Payment", value: "offline-payment", icon: WifiOff, permission: "manage_settings" },
  { title: "Banners", titleSo: "Banners", value: "banners", icon: ImageIcon, permission: "manage_settings" },
  { title: "Errors", titleSo: "⚠️ Errors", value: "errors", icon: AlertTriangle, permission: "manage_settings" },
  { title: "Balance", titleSo: "💰 Balance", value: "balance", icon: DollarSign, permission: "manage_devices" },
  { title: "Bundling Rules", titleSo: "📦 Xirmooyin Isku-xiran", value: "delivery-rules", icon: Package, permission: "manage_packages" },
  { title: "Devices", titleSo: "📱 Devices", value: "devices", icon: Smartphone, permission: "manage_devices" },
  { title: "Blocked Users", titleSo: "🚫 Block Users", value: "blocked-users", icon: AlertTriangle, permission: "manage_users" },
  { title: "Bulk SMS", titleSo: "📨 Bulk SMS", value: "bulk-sms", icon: MessageSquare, permission: "manage_bulk_sms" },
  { title: "Auto Top-Up", titleSo: "⚡ Auto Top-Up", value: "auto-topup", icon: Zap, permission: "manage_settings" },
  { title: "Audit Log", titleSo: "📋 Taariikhda", value: "audit-log", icon: LayoutDashboard, permission: "view_audit_log" },
  { title: "Admin Management", titleSo: "👥 Admins", value: "admin-management", icon: Users, permission: "manage_admins" },
  { title: "Fraud Alerts", titleSo: "🚨 Fraud Alerts", value: "fraud-alerts", icon: AlertTriangle, permission: "view_audit_log" },
  { title: "USSD Flows", titleSo: "📞 USSD Flows", value: "ussd-flows", icon: PhoneCall, permission: "manage_settings" },
  { title: "USSD Learning", titleSo: "🧠 USSD Learning", value: "ussd-learning", icon: PhoneCall, permission: "manage_settings" },
  { title: "Settings", titleSo: "⚙️ Settings", value: "settings", icon: Settings, permission: "manage_settings" },
];

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const { state, setOpenMobile } = useSidebar();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null); // null = loading, [] = full access

  useEffect(() => {
    const loadPermissions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perms } = await supabase
        .from('admin_permissions')
        .select('permission_key')
        .eq('user_id', user.id);

      setUserPermissions(perms?.map(p => p.permission_key) || []);
    };
    loadPermissions();
  }, []);

  const handleTabChange = (value: string) => {
    onTabChange(value);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Full access = no specific permissions set (empty array)
  const hasFullAccess = userPermissions !== null && userPermissions.length === 0;

  const visibleItems = navItems.filter(item => {
    if (!item.permission) return true; // dashboard always visible
    if (hasFullAccess) return true; // full access sees everything
    if (userPermissions === null) return false; // still loading
    return userPermissions.includes(item.permission);
  });

  return (
    <Sidebar
      className={collapsed && !isMobile ? "w-16" : !isMobile ? "w-64" : ""}
      collapsible={isMobile ? "offcanvas" : "icon"}
    >
      <SidebarContent>
        <div className="px-2 pt-2">
          <TenantSwitcher collapsed={collapsed && !isMobile} />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "text-center" : ""}>
            {!collapsed && (language === 'so' ? 'Maamul' : 'Admin Menu')}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;
                
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      onClick={() => handleTabChange(item.value)}
                      className={isActive ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/50"}
                      title={language === 'so' ? item.titleSo : item.title}
                    >
                      <Icon className={collapsed ? "h-5 w-5" : "h-4 w-4 mr-3"} />
                      {!collapsed && (
                        <span>{language === 'so' ? item.titleSo : item.title}</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
