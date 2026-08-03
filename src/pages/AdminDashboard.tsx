import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, LogOut, Edit, Power, Upload, X, Users, Package, CheckCircle, XCircle, Clock, Search, Copy, Phone, Save, Smartphone, Filter, CalendarIcon, Pencil, UserPlus, WifiOff } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSelector from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';
import { AddSimDialog } from '@/components/admin/AddSimDialog';
import { DeviceCard, groupSimsByDevice } from '@/components/admin/DeviceCard';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { DeviceManagement, Device as AndroidDevice } from '@/components/admin/DeviceManagement';
import { AdminAIChat } from '@/components/admin/AdminAIChat';

import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn, formatPrice } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Lazy-loaded tab components (only loaded when tab is active)
const TransactionsDashboard = lazy(() => import('@/components/admin/TransactionsDashboard').then(m => ({ default: m.TransactionsDashboard })));
const OnlinePaymentsDashboard = lazy(() => import('@/components/admin/OnlinePaymentsDashboard').then(m => ({ default: m.OnlinePaymentsDashboard })));
const WaafiPayDashboard = lazy(() => import('@/components/admin/WaafiPayDashboard').then(m => ({ default: m.WaafiPayDashboard })));
const SMSOfflineOrdersDashboard = lazy(() => import('@/components/admin/SMSOfflineOrdersDashboard').then(m => ({ default: m.SMSOfflineOrdersDashboard })));
const CombinedPaymentAnalytics = lazy(() => import('@/components/admin/CombinedPaymentAnalytics'));
const SendNotification = lazy(() => import('@/components/admin/SendNotification').then(m => ({ default: m.SendNotification })));
const PaymentSmsLog = lazy(() => import('@/components/admin/PaymentSmsLog').then(m => ({ default: m.PaymentSmsLog })));
const UnmatchedPayments = lazy(() => import('@/components/admin/UnmatchedPayments'));
const OfflinePaymentSettings = lazy(() => import('@/components/admin/OfflinePaymentSettings'));
const AppSettings = lazy(() => import('@/components/admin/AppSettings'));
const UssdFlowsManager = lazy(() => import('@/components/admin/UssdFlowsManager'));
const UssdLearningDashboard = lazy(() => import('@/components/admin/UssdLearningDashboard'));
const BalanceManagement = lazy(() => import('@/components/admin/BalanceManagement').then(m => ({ default: m.BalanceManagement })));
const PackageDeliveryRules = lazy(() => import('@/components/admin/PackageDeliveryRules').then(m => ({ default: m.PackageDeliveryRules })));
const DailyOrdersManager = lazy(() => import('@/components/admin/DailyOrdersManager').then(m => ({ default: m.DailyOrdersManager })));
const BlockedUsersManager = lazy(() => import('@/components/admin/BlockedUsersManager').then(m => ({ default: m.BlockedUsersManager })));
const BulkSmsManager = lazy(() => import('@/components/admin/BulkSmsManager').then(m => ({ default: m.BulkSmsManager })));
const AutoTopUpSettings = lazy(() => import('@/components/admin/AutoTopUpSettings').then(m => ({ default: m.AutoTopUpSettings })));
const AuditLogViewer = lazy(() => import('@/components/admin/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));
const AdminManagement = lazy(() => import('@/components/admin/AdminManagement').then(m => ({ default: m.AdminManagement })));
const FraudAlerts = lazy(() => import('@/components/admin/FraudAlerts').then(m => ({ default: m.FraudAlerts })));
const SimDashboard = lazy(() => import('@/components/admin/SimDashboard').then(m => ({ default: m.SimDashboard })));
const OutreachDashboard = lazy(() => import('@/components/admin/OutreachDashboard').then(m => ({ default: m.OutreachDashboard })));

// Tab components that manage their own data
const OrdersTab = lazy(() => import('@/components/admin/OrdersTab').then(m => ({ default: m.OrdersTab })));
const UsersTab = lazy(() => import('@/components/admin/UsersTab').then(m => ({ default: m.UsersTab })));
const OfflineRegistrationsTab = lazy(() => import('@/components/admin/OfflineRegistrationsTab').then(m => ({ default: m.OfflineRegistrationsTab })));
const WholesaleTiersManager = lazy(() => import('@/components/admin/WholesaleTiersManager'));

type UssdMethod = 'single_step' | 'interactive';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
  api_endpoint: string | null;
  promotional_text?: string;
  display_order: number;
  evoucher_rate?: number;
  ussd_method?: UssdMethod;
  ussd_flow_id?: string | null;
  ussd_single_template?: string | null;
}

interface UssdFlowOption {
  id: string;
  flow_name: string;
  trigger_code: string;
  is_enabled: boolean;
  provider_id: string | null;
}

interface DataPackage {
  id: string;
  provider_id: string;
  package_name: string;
  data_amount: string;
  validity_days: string;
  cost_price: number;
  selling_price: number;
  profit_margin: number;
  is_active: boolean;
  category_id: string | null;
  connection_type_label: string;
  ussd_method?: UssdMethod | null;
}

interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  ussd_code_template: string | null;
  payment_number: string | null;
  prefix_code: string | null;
}

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  is_active: boolean;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id: string | null;
  category_image?: string | null;
  ussd_method?: UssdMethod | null;
}

interface FeaturedPackage {
  id: string;
  package_id: string;
  display_order: number;
  is_active: boolean;
}

interface Order {
  id: string;
  customer_phone: string;
  payment_number: string;
  receiver_phone: string;
  package_name: string;
  package_id: string;
  data_amount: string;
  selling_price: number;
  status: 'pending' | 'completed' | 'failed' | 'payment_confirmed';
  created_at: string;
  provider_id: string;
  payment_provider_id: string;
  delivery_status: string;
  delivered_at: string | null;
  delivery_notes: string | null;
}

interface DeliveryInstruction {
  id: string;
  provider_id: string;
  instruction_template: string;
  code_template: string | null;
  notes: string | null;
  category_id: string | null;
  sim_password: string | null;
  package_id: string | null;
}

interface DiscountCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  usage_limit: number | null;
  times_used: number;
  applicable_to: 'all' | 'provider' | 'package' | null;
  provider_id: string | null;
  package_id: string | null;
}

interface CustomerDiscount {
  id: string;
  customer_phone: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  is_active: boolean;
  applicable_to: 'all' | 'provider' | 'package' | null;
  provider_id: string | null;
  package_id: string | null;
  notes: string | null;
}

interface ProfitOverride {
  id: string;
  package_id: string;
  custom_profit_margin: number;
  notes: string | null;
}

interface ErrorMessage {
  id: string;
  error_type: string;
  title: string;
  message: string;
  icon_type: 'emoji' | 'image';
  icon_value: string;
  is_animated: boolean;
}

interface Device {
  id: string;
  device_id: string;
  device_name: string | null;
  sim1_number: string | null;
  sim2_number: string | null;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

// Lazy Loading Fallback
const TabLoader = () => (
  <div className="flex justify-center items-center p-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Error Message Card Component
const ErrorMessageCard = ({ 
  msg, 
  onUpdate, 
  onImageUpload, 
  uploadingIcon, 
  language 
}: { 
  msg: ErrorMessage; 
  onUpdate: (updated: ErrorMessage) => void; 
  onImageUpload: (errorType: string, file: File, currentMsg: ErrorMessage) => void;
  uploadingIcon: string | null;
  language: string;
}) => {
  const [localMsg, setLocalMsg] = useState(msg);

  useEffect(() => {
    setLocalMsg(msg);
  }, [msg]);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {msg.error_type === 'insufficient_balance' && '💰 Haraaga kuma filna'}
            {msg.error_type === 'user_cancelled' && '❌ Waad diidday'}
            {msg.error_type === 'timeout' && '⏱️ Waqtigu dhammaaday'}
            {msg.error_type === 'general' && '⚠️ Khalad'}
          </h3>
          <Button size="sm" onClick={() => onUpdate(localMsg)}>
            <Save className="w-4 h-4 mr-2" />
            {language === 'so' ? 'Kaydi' : 'Save'}
          </Button>
        </div>
        <div>
          <Label>{language === 'so' ? 'Cinwaan' : 'Title'}</Label>
          <Input value={localMsg.title} onChange={(e) => setLocalMsg({ ...localMsg, title: e.target.value })} />
        </div>
        <div>
          <Label>{language === 'so' ? 'Fariinta' : 'Message'}</Label>
          <Textarea value={localMsg.message} onChange={(e) => setLocalMsg({ ...localMsg, message: e.target.value })} rows={3} />
        </div>
        <div>
          <Label>Icon</Label>
          <div className="flex items-center gap-4 mt-2">
            {localMsg.icon_type === 'emoji' ? (
              <div className="text-5xl">{localMsg.icon_value}</div>
            ) : (
              <img src={localMsg.icon_value} alt="Icon" className="w-20 h-20 object-contain" />
            )}
            <div className="flex-1 space-y-2">
              <Input placeholder={localMsg.icon_type === 'emoji' ? 'Gali emoji' : 'Image URL'} value={localMsg.icon_value} onChange={(e) => setLocalMsg({ ...localMsg, icon_value: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setLocalMsg({ ...localMsg, icon_type: 'emoji' })}>Emoji</Button>
                <Button size="sm" variant="outline" onClick={() => setLocalMsg({ ...localMsg, icon_type: 'image' })}>Sawir</Button>
                <label htmlFor={`upload-${msg.error_type}`}>
                  <Button size="sm" variant="outline" asChild disabled={uploadingIcon === msg.error_type}>
                    <span><Upload className="w-4 h-4 mr-2" />{uploadingIcon === msg.error_type ? 'Soo gelaya...' : 'Soo geli'}</span>
                  </Button>
                </label>
                <input id={`upload-${msg.error_type}`} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImageUpload(msg.error_type, file, localMsg); }} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <Label>{language === 'so' ? 'Animation ku shaqee?' : 'Enable Animation?'}</Label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={localMsg.is_animated} onChange={(e) => setLocalMsg({ ...localMsg, is_animated: e.target.checked })} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>
    </Card>
  );
};

// Error Messages Manager Component
const ErrorMessagesManager = () => {
  const { language } = useLanguage();
  const [errorMessages, setErrorMessages] = useState<ErrorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingIcon, setUploadingIcon] = useState<string | null>(null);

  useEffect(() => { loadErrorMessages(); }, []);

  const loadErrorMessages = async () => {
    const { data, error } = await supabase.from('error_messages').select('*').order('error_type');
    if (data) setErrorMessages(data as ErrorMessage[]);
    setLoading(false);
  };

  const updateErrorMessage = async (updated: ErrorMessage) => {
    const { error } = await supabase.from('error_messages').update({ title: updated.title, message: updated.message, icon_type: updated.icon_type, icon_value: updated.icon_value, is_animated: updated.is_animated }).eq('id', updated.id);
    if (error) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Guul', description: 'Waa la cusboonaysiiyay' }); loadErrorMessages(); }
  };

  const handleImageUpload = async (errorType: string, file: File, currentMsg: ErrorMessage) => {
    try {
      setUploadingIcon(errorType);
      const fileExt = file.name.split('.').pop();
      const fileName = `${errorType}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('error-icons').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('error-icons').getPublicUrl(fileName);
      await updateErrorMessage({ ...currentMsg, icon_type: 'image', icon_value: publicUrl });
    } catch (error: any) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); }
    finally { setUploadingIcon(null); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      {errorMessages.map((msg) => (
        <ErrorMessageCard key={msg.id} msg={msg} onUpdate={updateErrorMessage} onImageUpload={handleImageUpload} uploadingIcon={uploadingIcon} language={language} />
      ))}
    </div>
  );
};

const LiveClock = ({ language }: { language: string }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  const formatted = time.toLocaleString(language === 'so' ? 'so-SO' : 'en-US', { timeZone: 'Africa/Mogadishu', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return (
    <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground font-mono">
      <Clock className="h-4 w-4" /><span>{formatted}</span>
    </div>
  );
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Core shared data (loaded on mount - lightweight)
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentProviders, setPaymentProviders] = useState<PaymentProvider[]>([]);
  const [deliveryInstructions, setDeliveryInstructions] = useState<DeliveryInstruction[]>([]);

  // Tab-specific data (loaded lazily when tab is opened)
  const [packages, setPackages] = useState<DataPackage[]>([]);
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  const [featuredPackages, setFeaturedPackages] = useState<FeaturedPackage[]>([]);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [customerDiscounts, setCustomerDiscounts] = useState<CustomerDiscount[]>([]);
  const [discountsLoaded, setDiscountsLoaded] = useState(false);

  // Notifications tab - pending/confirmed orders (lightweight)
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [confirmedOrders, setConfirmedOrders] = useState<Order[]>([]);

  // Devices state
  const [androidDevices, setAndroidDevices] = useState<AndroidDevice[]>([]);
  const [selectedSim, setSelectedSim] = useState<AndroidDevice | null>(null);
  const [showAddSimDialog, setShowAddSimDialog] = useState(false);

  // Provider management state
  const [newProvider, setNewProvider] = useState<{ provider_name: string; provider_logo: string; api_endpoint: string; promotional_text: string; display_order: number; ussd_method: UssdMethod; ussd_flow_id: string; ussd_single_template: string; evoucher_rate: number; sim_password: string }>({ provider_name: '', provider_logo: '', api_endpoint: '', promotional_text: 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!', display_order: 0, ussd_method: 'single_step', ussd_flow_id: '', ussd_single_template: '', evoucher_rate: 0, sim_password: '' });
  const [editingProviderPin, setEditingProviderPin] = useState<string>('');
  const [ussdFlowOptions, setUssdFlowOptions] = useState<UssdFlowOption[]>([]);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showProviderEditDialog, setShowProviderEditDialog] = useState(false);
  const [providerLogoFile, setProviderLogoFile] = useState<File | null>(null);
  const [providerLogoPreview, setProviderLogoPreview] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Package management state
  const [editingPackage, setEditingPackage] = useState<DataPackage | null>(null);
  const [newPackage, setNewPackage] = useState<{ provider_id: string; package_name: string; data_amount: string; validity_days: number; cost_price: number; selling_price: number; category_id: string; connection_type_label: string; profit_margin: number; ussd_method: UssdMethod | ''; }>({ provider_id: '', package_name: '', data_amount: '', validity_days: 30, cost_price: 0, selling_price: 0, category_id: '', connection_type_label: 'Mobile Internet', profit_margin: 15, ussd_method: '' });
  const [validityDaysInput, setValidityDaysInput] = useState<string>('30');
  const [editValidityDaysInput, setEditValidityDaysInput] = useState<string>('');

  // Payment provider state
  const [newPaymentProvider, setNewPaymentProvider] = useState({ provider_name: '', provider_logo: '', commission_rate: 0, ussd_code_template: '', payment_number: '', prefix_code: '' });
  const [paymentProviderLogoFile, setPaymentProviderLogoFile] = useState<File | null>(null);
  const [paymentProviderLogoPreview, setPaymentProviderLogoPreview] = useState<string>('');
  const [editingPaymentProvider, setEditingPaymentProvider] = useState<PaymentProvider | null>(null);
  const [editPaymentNumber, setEditPaymentNumber] = useState('');
  const [editPrefixCode, setEditPrefixCode] = useState('');
  const [editUssdTemplate, setEditUssdTemplate] = useState('');
  const [editCommissionRate, setEditCommissionRate] = useState('');

  // Banner state
  const [newBanner, setNewBanner] = useState({ banner_image: '', alt_text: '', display_order: 1, media_type: 'image' as 'image' | 'video', video_duration: null as number | null, rotation_interval: null as number | null });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // Category state
  const [newCategory, setNewCategory] = useState<{ category_name: string; display_order: number; provider_id: string; category_image: string; ussd_method: UssdMethod | ''; }>({ category_name: '', display_order: 1, provider_id: '', category_image: '', ussd_method: '' });
  const [selectedCategoryProvider, setSelectedCategoryProvider] = useState<string>('all');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCategoryEditDialog, setShowCategoryEditDialog] = useState(false);
  const [categoryImageFile, setCategoryImageFile] = useState<File | null>(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState<string>('');

  // Delivery instructions state
  const [newDeliveryInstruction, setNewDeliveryInstruction] = useState({ provider_id: '', code_template: '', notes: '', category_id: '', sim_password: '', package_id: '' });
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);

  // Template code quick edit
  const [editingTemplateCode, setEditingTemplateCode] = useState<{ packageId: string; packageName: string; providerId: string; categoryId: string | null; currentCode: string; instructionId: string | null; templateSource: 'package' | 'category' | 'provider'; } | null>(null);
  const [quickTemplateCode, setQuickTemplateCode] = useState('');

  // Delivery tab
  const [orderSearch, setOrderSearch] = useState('');
  const [showUSSDDialog, setShowUSSDDialog] = useState(false);
  const [generatedUSSDCode, setGeneratedUSSDCode] = useState('');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  // Analytics refresh
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);

  // Scroll position
  const scrollPositionRef = useRef<number>(0);
  const saveScrollPosition = () => { scrollPositionRef.current = window.scrollY; };
  const restoreScrollPosition = () => { setTimeout(() => { window.scrollTo(0, scrollPositionRef.current); }, 100); };

  useEffect(() => { checkAdminAccess(); }, []);

  // Lazy load tab data when tab changes
  useEffect(() => {
    if (!isAdmin) return;
    
    if ((activeTab === 'packages' || activeTab === 'featured' || activeTab === 'pricing' || activeTab === 'delivery' || activeTab === 'notifications') && !packagesLoaded) {
      loadPackages();
    }
    if (activeTab === 'banners' && !bannersLoaded) {
      loadBanners();
    }
    if ((activeTab === 'featured') && !featuredLoaded) {
      loadFeatured();
    }
    if (activeTab === 'pricing' && !discountsLoaded) {
      loadDiscounts();
    }
  }, [activeTab, isAdmin]);

  const loadPackages = async () => {
    const { data } = await supabase.from('data_packages_config').select('*, providers_config!provider_id(evoucher_rate)').order('selling_price');
    if (data) { setPackages(data); setPackagesLoaded(true); }
  };

  const loadBanners = async () => {
    const { data } = await supabase.from('banners_config').select('*').order('display_order');
    if (data) { setBanners(data); setBannersLoaded(true); }
  };

  const loadFeatured = async () => {
    const { data } = await supabase.from('featured_packages').select('*').order('display_order');
    if (data) { setFeaturedPackages(data); setFeaturedLoaded(true); }
  };

  const loadDiscounts = async () => {
    const { data } = await supabase.from('customer_discounts').select('*').order('created_at', { ascending: false });
    if (data) { setCustomerDiscounts(data as CustomerDiscount[]); setDiscountsLoaded(true); }
  };

  // Real-time for pending/confirmed orders (lightweight - notification tab)
  useEffect(() => {
    if (!isAdmin) return;

    // Load just pending/confirmed orders
    const loadPendingOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['pending', 'payment_confirmed'])
        .order('created_at', { ascending: false });
      if (data) {
        setPendingOrders((data as Order[]).filter(o => o.status === 'pending'));
        setConfirmedOrders((data as Order[]).filter(o => o.status === 'payment_confirmed'));
      }
    };
    loadPendingOrders();

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const newOrder = payload.new as Order;
        if (newOrder.status === 'pending') {
          setPendingOrders(prev => {
            if (prev.find(o => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
        }
        setAnalyticsRefresh(prev => prev + 1);
        toast({ title: '🔔 Dalab Cusub!', description: `${newOrder.customer_phone} - ${newOrder.package_name} - $${newOrder.selling_price}`, duration: 15000 });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const updated = payload.new as Order;
        setPendingOrders(prev => prev.filter(o => o.id !== updated.id));
        setConfirmedOrders(prev => prev.filter(o => o.id !== updated.id));
        if (updated.status === 'pending') setPendingOrders(prev => [updated, ...prev]);
        if (updated.status === 'payment_confirmed') setConfirmedOrders(prev => [updated, ...prev]);
        setAnalyticsRefresh(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  const checkAdminAccess = async () => {
    try {
      const emergencySession = localStorage.getItem('adminEmergencySession');
      const emergencyTime = localStorage.getItem('adminEmergencyTime');
      if (emergencySession === 'true' && emergencyTime) {
        const sessionAge = Date.now() - parseInt(emergencyTime);
        if (sessionAge < 24 * 60 * 60 * 1000) { setIsAdmin(true); loadCoreData(); return; }
        else { localStorage.removeItem('adminEmergencySession'); localStorage.removeItem('adminEmergencyTime'); }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }

      const { data: roleData, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (error || !roleData) { navigate('/admin/login'); return; }

      setIsAdmin(true);
      loadCoreData();
    } catch (error) {
      const emergencySession = localStorage.getItem('adminEmergencySession');
      if (emergencySession === 'true') { setIsAdmin(true); loadCoreData(); }
      else { navigate('/admin/login'); }
    }
  };

  // Only load essential shared data on mount (4 queries instead of 12)
  const loadCoreData = async () => {
    setLoading(true);
    try {
      await supabase.from('package_categories').delete().is('provider_id', null);
      
      const [providersRes, categoriesRes, paymentRes, deliveryRes, flowsRes] = await Promise.all([
        supabase.from('providers_config').select('*').order('provider_name'),
        supabase.from('package_categories').select('*').order('display_order'),
        supabase.from('payment_providers_config').select('*').order('provider_name'),
        supabase.from('delivery_instructions').select('*'),
        supabase.from('ussd_flows').select('id, flow_name, trigger_code, is_enabled, provider_id').order('flow_name'),
      ]);

      if (providersRes.data) setProviders(providersRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (paymentRes.data) setPaymentProviders(paymentRes.data);
      if (deliveryRes.data) setDeliveryInstructions(deliveryRes.data);
      if (flowsRes.data) setUssdFlowOptions(flowsRes.data as UssdFlowOption[]);
    } catch (error) {
      console.error('Error loading core data:', error);
      toast({ title: 'Khalad', description: 'Ma suurtagelin data-ka', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Handle devices from DeviceManagement
  const handleDevicesChange = (devices: AndroidDevice[]) => {
    setAndroidDevices(devices);
    if (devices.length > 0 && !selectedSim) setSelectedSim(devices[0]);
    if (selectedSim) {
      const updated = devices.find(d => d.id === selectedSim.id);
      if (updated) setSelectedSim(updated);
    }
  };

  // ===== Provider functions =====
  const handleProviderLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) { toast({ title: 'Khalad', description: 'Sawir yar ka dooro (max 2MB)', variant: 'destructive' }); return; }
      setProviderLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setProviderLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addProvider = async () => {
    if (!newProvider.provider_name) { toast({ title: 'Khalad', description: 'Gali magaca', variant: 'destructive' }); return; }
    let logoUrl = newProvider.provider_logo;
    if (providerLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = providerLogoFile.name.split('.').pop();
        const fileName = `provider_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, providerLogoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        logoUrl = publicUrl;
      } catch (error: any) { toast({ title: 'Khalad', description: 'Logo upload failed', variant: 'destructive' }); setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    const { data, error } = await supabase.from('providers_config').insert([{ provider_name: newProvider.provider_name, provider_logo: logoUrl, api_endpoint: newProvider.api_endpoint, promotional_text: newProvider.promotional_text, display_order: newProvider.display_order, evoucher_rate: newProvider.evoucher_rate || 0, ussd_method: newProvider.ussd_method, ussd_flow_id: newProvider.ussd_method === 'interactive' ? (newProvider.ussd_flow_id || null) : null, ussd_single_template: newProvider.ussd_method === 'single_step' ? (newProvider.ussd_single_template || null) : null }]).select();
    if (!error && data) {
      setProviders(prev => [...prev, ...data]);
      if (newProvider.sim_password && data[0]?.id) {
        await supabase.from('delivery_instructions').insert([{ provider_id: data[0].id, instruction_template: '', sim_password: newProvider.sim_password }]);
        const { data: di } = await supabase.from('delivery_instructions').select('*');
        if (di) setDeliveryInstructions(di as any);
      }
      setNewProvider({ provider_name: '', provider_logo: '', api_endpoint: '', promotional_text: 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!', display_order: 0, ussd_method: 'single_step', ussd_flow_id: '', ussd_single_template: '', evoucher_rate: 0, sim_password: '' });
      setProviderLogoFile(null); setProviderLogoPreview('');
      toast({ title: 'Guul', description: 'Provider waa la daray' });
    }
  };

  const updateProvider = async () => {
    if (!editingProvider) return;
    let logoUrl = editingProvider.provider_logo;
    if (providerLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = providerLogoFile.name.split('.').pop();
        const fileName = `provider_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, providerLogoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        logoUrl = publicUrl;
      } catch { toast({ title: 'Khalad', description: 'Logo upload failed', variant: 'destructive' }); setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    const { error } = await supabase.from('providers_config').update({ provider_name: editingProvider.provider_name, provider_logo: logoUrl, api_endpoint: editingProvider.api_endpoint, promotional_text: editingProvider.promotional_text, display_order: editingProvider.display_order, evoucher_rate: editingProvider.evoucher_rate ?? 0, ussd_method: editingProvider.ussd_method || 'single_step', ussd_flow_id: editingProvider.ussd_method === 'interactive' ? (editingProvider.ussd_flow_id || null) : null, ussd_single_template: editingProvider.ussd_method === 'single_step' ? (editingProvider.ussd_single_template || null) : null }).eq('id', editingProvider.id);
    if (!error) {
      const existingDi = deliveryInstructions.find(d => d.provider_id === editingProvider.id && !d.category_id && !d.package_id);
      if (editingProviderPin) {
        if (existingDi) {
          await supabase.from('delivery_instructions').update({ sim_password: editingProviderPin }).eq('id', existingDi.id);
        } else {
          await supabase.from('delivery_instructions').insert([{ provider_id: editingProvider.id, instruction_template: '', sim_password: editingProviderPin }]);
        }
        const { data: di } = await supabase.from('delivery_instructions').select('*');
        if (di) setDeliveryInstructions(di as any);
      } else if (existingDi) {
        await supabase.from('delivery_instructions').update({ sim_password: null }).eq('id', existingDi.id);
        const { data: di } = await supabase.from('delivery_instructions').select('*');
        if (di) setDeliveryInstructions(di as any);
      }
      setProviders(prev => prev.map(p => p.id === editingProvider.id ? { ...editingProvider, provider_logo: logoUrl } : p));
      setShowProviderEditDialog(false); setEditingProvider(null); setProviderLogoFile(null); setProviderLogoPreview(''); setEditingProviderPin('');
      toast({ title: 'Guul', description: 'Provider waa la cusboonaysiiyay' });
    }
  };

  const toggleProviderStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('providers_config').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
  };

  const deleteProvider = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('providers_config').delete().eq('id', id);
    if (error) {
      const isFk = (error as any).code === '23503' || /foreign key|violates/i.test(error.message || '');
      toast({
        title: 'Lama tirtiri karo',
        description: isFk
          ? 'Shirkaddan waxay leedahay dalabyo (orders) hore loo diray, sidaa darteed lama tirtiri karo. Halkii, ka dhig "Inactive".'
          : error.message,
        variant: 'destructive',
      });
      return;
    }
    // Xaqiiji in dhab ahaan la tirtiray (RLS way iska aamusi kartaa)
    const { count } = await supabase
      .from('providers_config')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    if (count && count > 0) {
      toast({
        title: 'Lama tirtirin',
        description: 'Ma haysatid ogolaansho (admin) oo ku filan tirtiridda shirkaddan.',
        variant: 'destructive',
      });
      return;
    }
    setProviders(prev => prev.filter(p => p.id !== id));
    toast({ title: 'Guul', description: 'Shirkadda waa la tirtiray' });
  };

  // ===== Package functions =====
  const addPackage = async () => {
    if (!newPackage.provider_id || !newPackage.package_name) { toast({ title: 'Khalad', description: 'Buuxi xogta', variant: 'destructive' }); return; }
    const profitMargin = newPackage.profit_margin || 15;
    const { ussd_method: _newPkgMethod, ...newPkgRest } = newPackage;
    const { data, error } = await supabase.from('data_packages_config').insert([{ ...newPkgRest, validity_days: validityDaysInput, profit_margin: profitMargin, ussd_method: _newPkgMethod ? _newPkgMethod : null }]).select('*, providers_config!provider_id(evoucher_rate)');
    if (!error && data) {
      setPackages(prev => [...prev, ...data]);
      setNewPackage({ provider_id: '', package_name: '', data_amount: '', validity_days: 30, cost_price: 0, selling_price: 0, category_id: '', connection_type_label: 'Mobile Internet', profit_margin: 15, ussd_method: '' });
      setValidityDaysInput('30');
      toast({ title: 'Guul', description: 'Package waa la daray' });
    }
  };

  const togglePackageStatus = async (id: string, currentStatus: boolean) => {
    saveScrollPosition();
    const { error } = await supabase.from('data_packages_config').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) { setPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p)); restoreScrollPosition(); }
  };

  const deletePackage = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('data_packages_config').delete().eq('id', id);
    if (!error) setPackages(prev => prev.filter(p => p.id !== id));
  };

  const updatePackage = async () => {
    if (!editingPackage) return;
    const profitMargin = ((editingPackage.selling_price - editingPackage.cost_price) / editingPackage.cost_price) * 100;
    const { error } = await supabase.from('data_packages_config').update({ package_name: editingPackage.package_name, data_amount: editingPackage.data_amount, validity_days: editValidityDaysInput, cost_price: editingPackage.cost_price, selling_price: editingPackage.selling_price, profit_margin: profitMargin, category_id: editingPackage.category_id, connection_type_label: editingPackage.connection_type_label, ussd_method: editingPackage.ussd_method || null }).eq('id', editingPackage.id);
    if (!error) {
      setPackages(prev => prev.map(p => p.id === editingPackage.id ? { ...editingPackage, validity_days: editValidityDaysInput, profit_margin: profitMargin } : p));
      setEditingPackage(null); restoreScrollPosition();
      toast({ title: 'Guul', description: 'Package waa la beddelay' });
    }
  };

  // ===== Payment Provider functions =====
  const handlePaymentProviderLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return;
      setPaymentProviderLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPaymentProviderLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addPaymentProvider = async () => {
    if (!newPaymentProvider.provider_name) { toast({ title: 'Khalad', description: 'Gali magaca', variant: 'destructive' }); return; }
    let logoUrl = newPaymentProvider.provider_logo;
    if (paymentProviderLogoFile) {
      setUploadingImage(true);
      try {
        const fileExt = paymentProviderLogoFile.name.split('.').pop();
        const fileName = `payment_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, paymentProviderLogoFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        logoUrl = publicUrl;
      } catch { setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    const { data, error } = await supabase.from('payment_providers_config').insert([{ provider_name: newPaymentProvider.provider_name, provider_logo: logoUrl, commission_rate: newPaymentProvider.commission_rate, ussd_code_template: newPaymentProvider.ussd_code_template, payment_number: newPaymentProvider.payment_number, prefix_code: newPaymentProvider.prefix_code }]).select();
    if (!error && data) {
      setPaymentProviders(prev => [...prev, ...data]);
      setNewPaymentProvider({ provider_name: '', provider_logo: '', commission_rate: 0, ussd_code_template: '', payment_number: '', prefix_code: '' });
      setPaymentProviderLogoFile(null); setPaymentProviderLogoPreview('');
    }
  };

  const deletePaymentProvider = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('payment_providers_config').delete().eq('id', id);
    if (!error) setPaymentProviders(prev => prev.filter(p => p.id !== id));
  };

  const updatePaymentProvider = async () => {
    if (!editingPaymentProvider) return;
    const { error } = await supabase.from('payment_providers_config').update({ payment_number: editPaymentNumber || null, prefix_code: editPrefixCode || null, ussd_code_template: editUssdTemplate || null, commission_rate: parseFloat(editCommissionRate) || 0 }).eq('id', editingPaymentProvider.id);
    if (!error) {
      setPaymentProviders(prev => prev.map(p => p.id === editingPaymentProvider.id ? { ...p, payment_number: editPaymentNumber || null, prefix_code: editPrefixCode || null, ussd_code_template: editUssdTemplate || null, commission_rate: parseFloat(editCommissionRate) || 0 } : p));
      setEditingPaymentProvider(null);
    }
  };

  // ===== Banner functions =====
  const getVideoDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { window.URL.revokeObjectURL(video.src); resolve(video.duration); };
    video.onerror = () => reject(new Error('Failed'));
    video.src = URL.createObjectURL(file);
  });

  const processFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return;
    if (file.size > 10 * 1024 * 1024) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addBanner = async () => {
    let mediaUrl = newBanner.banner_image;
    let detectedMediaType = newBanner.media_type;
    let videoDuration = newBanner.video_duration;
    if (selectedFile) {
      setUploadingImage(true);
      try {
        const isVideo = selectedFile.type.startsWith('video/');
        detectedMediaType = isVideo ? 'video' : 'image';
        if (isVideo) { const dur = await getVideoDuration(selectedFile); if (dur > 300) { setUploadingImage(false); return; } videoDuration = Math.floor(dur); }
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('banners').upload(fileName, selectedFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('banners').getPublicUrl(fileName);
        mediaUrl = publicUrl;
      } catch { setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    if (!mediaUrl) return;
    const { data, error } = await supabase.from('banners_config').insert([{ banner_image: mediaUrl, alt_text: newBanner.alt_text, display_order: newBanner.display_order, media_type: detectedMediaType, video_duration: videoDuration, rotation_interval: newBanner.rotation_interval }]).select();
    if (!error && data) {
      setBanners(prev => [...prev, ...data]);
      setNewBanner({ banner_image: '', alt_text: '', display_order: 1, media_type: 'image', video_duration: null, rotation_interval: null });
      setSelectedFile(null); setPreviewUrl('');
    }
  };

  const toggleBannerStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('banners_config').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) setBanners(prev => prev.map(b => b.id === id ? { ...b, is_active: !currentStatus } : b));
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('banners_config').delete().eq('id', id);
    if (!error) setBanners(prev => prev.filter(b => b.id !== id));
  };

  // ===== Category functions =====
  const handleCategoryImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;
      setCategoryImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCategoryImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearCategoryImageFile = () => { setCategoryImageFile(null); setCategoryImagePreview(''); };

  const addCategory = async () => {
    if (!newCategory.category_name || !newCategory.provider_id) return;
    let imageUrl = newCategory.category_image;
    if (categoryImageFile) {
      setUploadingImage(true);
      try {
        const fileExt = categoryImageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, categoryImageFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        imageUrl = publicUrl;
      } catch { setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    const { data, error } = await supabase.from('package_categories').insert([{ category_name: newCategory.category_name, display_order: newCategory.display_order, provider_id: newCategory.provider_id, category_image: imageUrl || null, ussd_method: newCategory.ussd_method ? newCategory.ussd_method : null }]).select();
    if (!error && data) {
      setCategories(prev => [...prev, ...data]);
      setNewCategory({ category_name: '', display_order: 1, provider_id: '', category_image: '', ussd_method: '' });
      clearCategoryImageFile();
    }
  };

  const toggleCategoryStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('package_categories').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('package_categories').delete().eq('id', id);
    if (!error) setCategories(prev => prev.filter(c => c.id !== id));
  };

  const updateCategory = async () => {
    if (!editingCategory) return;
    let imageUrl = editingCategory.category_image;
    if (categoryImageFile) {
      setUploadingImage(true);
      try {
        const fileExt = categoryImageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, categoryImageFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        imageUrl = publicUrl;
      } catch { setUploadingImage(false); return; }
      finally { setUploadingImage(false); }
    }
    const { error } = await supabase.from('package_categories').update({ category_name: editingCategory.category_name, display_order: editingCategory.display_order, provider_id: editingCategory.provider_id, category_image: imageUrl || null, ussd_method: editingCategory.ussd_method || null }).eq('id', editingCategory.id);
    if (!error) {
      setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...editingCategory, category_image: imageUrl || null } : c));
      setShowCategoryEditDialog(false); setEditingCategory(null); clearCategoryImageFile();
    }
  };

  // ===== Delivery instruction functions =====
  const addDeliveryInstruction = async () => {
    if (!newDeliveryInstruction.provider_id || !newDeliveryInstruction.code_template) return;
    const instructionData = { provider_id: newDeliveryInstruction.provider_id, instruction_template: '', code_template: newDeliveryInstruction.code_template || null, notes: newDeliveryInstruction.notes || null, category_id: newDeliveryInstruction.category_id || null, sim_password: newDeliveryInstruction.sim_password || null, package_id: newDeliveryInstruction.package_id || null };
    let error;
    if (editingInstructionId) {
      const result = await supabase.from('delivery_instructions').update(instructionData).eq('id', editingInstructionId);
      error = result.error;
    } else {
      const result = await supabase.from('delivery_instructions').insert([instructionData]);
      error = result.error;
    }
    if (!error) {
      cancelEditInstruction();
      const { data } = await supabase.from('delivery_instructions').select('*');
      if (data) setDeliveryInstructions(data);
    }
  };

  const startEditInstruction = (instruction: DeliveryInstruction) => {
    setEditingInstructionId(instruction.id);
    setNewDeliveryInstruction({ provider_id: instruction.provider_id, code_template: instruction.code_template || '', notes: instruction.notes || '', category_id: instruction.category_id || '', sim_password: instruction.sim_password || '', package_id: instruction.package_id || '' });
  };

  const cancelEditInstruction = () => {
    setEditingInstructionId(null);
    setNewDeliveryInstruction({ provider_id: '', code_template: '', notes: '', category_id: '', sim_password: '', package_id: '' });
  };

  const deleteDeliveryInstruction = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('delivery_instructions').delete().eq('id', id);
    if (!error) setDeliveryInstructions(prev => prev.filter(d => d.id !== id));
  };

  const saveQuickTemplateCode = async () => {
    if (!editingTemplateCode || !quickTemplateCode.trim()) return;
    const instructionData = { provider_id: editingTemplateCode.providerId, instruction_template: '', code_template: quickTemplateCode.trim(), notes: null, category_id: editingTemplateCode.categoryId || null, sim_password: null, package_id: editingTemplateCode.packageId };
    const existing = deliveryInstructions.find(d => d.provider_id === editingTemplateCode.providerId && d.package_id === editingTemplateCode.packageId);
    let error;
    if (existing) { const r = await supabase.from('delivery_instructions').update({ code_template: quickTemplateCode.trim() }).eq('id', existing.id); error = r.error; }
    else { const r = await supabase.from('delivery_instructions').insert([instructionData]); error = r.error; }
    if (!error) {
      setEditingTemplateCode(null); setQuickTemplateCode('');
      const { data } = await supabase.from('delivery_instructions').select('*');
      if (data) setDeliveryInstructions(data);
      toast({ title: 'Guul', description: 'Template code waa la baddelay' });
    }
  };

  // ===== Featured packages =====
  const addFeaturedPackage = async (packageId: string) => {
    if (featuredPackages.find(fp => fp.package_id === packageId)) return;
    const { data, error } = await supabase.from('featured_packages').insert([{ package_id: packageId, display_order: featuredPackages.length + 1, is_active: true }]).select();
    if (!error && data) setFeaturedPackages(prev => [...prev, ...data]);
  };

  const removeFeaturedPackage = async (id: string) => {
    if (!confirm('Ma hubtaa?')) return;
    const { error } = await supabase.from('featured_packages').delete().eq('id', id);
    if (!error) setFeaturedPackages(prev => prev.filter(fp => fp.id !== id));
  };

  // ===== Customer discounts =====
  const addCustomerDiscount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const customerPhone = formData.get('customer_phone') as string;
    const discountType = formData.get('discount_type') as 'percentage' | 'fixed';
    const discountValue = parseFloat(formData.get('discount_value') as string);
    const applicableTo = formData.get('applicable_to') as 'all' | 'provider' | 'package';
    const notes = formData.get('notes') as string;
    if (!customerPhone || !discountValue) return;
    const { data, error } = await supabase.from('customer_discounts').insert([{ customer_phone: customerPhone, discount_type: discountType, discount_value: discountValue, applicable_to: applicableTo, provider_id: null, package_id: null, notes: notes || null }]).select();
    if (!error && data) { setCustomerDiscounts(prev => [...data as CustomerDiscount[], ...prev]); e.currentTarget.reset(); }
  };

  const deleteCustomerDiscount = async (id: string) => {
    const { error } = await supabase.from('customer_discounts').delete().eq('id', id);
    if (!error) setCustomerDiscounts(prev => prev.filter(d => d.id !== id));
  };

  // ===== Delivery tab USSD =====
  const sendUSSDCode = async (order: Order) => {
    const orderPackage = packages.find(p => p.id === order.package_id);
    let instruction = deliveryInstructions.find(d => d.provider_id === order.provider_id && d.category_id === orderPackage?.category_id);
    if (!instruction) instruction = deliveryInstructions.find(d => d.provider_id === order.provider_id && !d.category_id);
    if (!instruction?.code_template) { toast({ title: 'Khalad', description: 'Code template ma jirto', variant: 'destructive' }); return; }
    const priceForUSSD = order.selling_price.toString().replace('.', '*');
    let ussdCode = instruction.code_template;
    ussdCode = ussdCode.replace(/{receiver_phone}/g, order.receiver_phone).replace(/{package_name}/g, order.package_name).replace(/{data_amount}/g, order.data_amount).replace(/{customer_phone}/g, order.customer_phone).replace(/{sim_password}/g, instruction.sim_password || '').replace(/{price}/g, priceForUSSD);
    setGeneratedUSSDCode(ussdCode); setCurrentOrder(order); setShowUSSDDialog(true);
  };

  const copyUSSDCode = () => { navigator.clipboard.writeText(generatedUSSDCode); toast({ title: 'Guul', description: 'Code copied' }); };

  const completeOrderAfterUSSD = async () => {
    if (!currentOrder) return;
    const { error } = await supabase.from('orders').update({ status: 'completed', delivery_status: 'completed', delivered_at: new Date().toISOString() }).eq('id', currentOrder.id);
    if (!error) {
      setShowUSSDDialog(false); setGeneratedUSSDCode('');
      setConfirmedOrders(prev => prev.filter(o => o.id !== currentOrder.id));
      setCurrentOrder(null);
      toast({ title: 'Guul', description: 'Order completed' });
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/'); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-4 gap-4">
            <SidebarTrigger />
            <div className="flex-1 flex justify-between items-center">
              <div><h1 className="text-lg md:text-2xl font-bold">Admin Dashboard</h1></div>
              <div className="flex items-center gap-2">
                <LiveClock language={language} />
                <LanguageSelector />
                <ThemeToggle />
                <Button onClick={handleLogout} variant="outline" size="sm"><LogOut className="h-4 w-4 mr-2" />{language === 'so' ? 'Ka bax' : 'Logout'}</Button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8 overflow-auto">
            <div className="max-w-7xl mx-auto">
              <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="dashboard" className="space-y-6">

                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                  <TabsContent value="dashboard" className="space-y-6">
                    <AnalyticsDashboard refreshTrigger={analyticsRefresh} />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">📱 Devices & SIM-yada</h2>
                        <Button onClick={() => setShowAddSimDialog(true)}><Plus className="w-4 h-4 mr-2" /> Device Cusub</Button>
                      </div>
                      {groupSimsByDevice(androidDevices).length > 0 ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                          {groupSimsByDevice(androidDevices).map((device) => <DeviceCard key={device.device_id} device={device} onUpdate={() => {}} />)}
                        </div>
                      ) : (
                        <Card><CardContent className="flex flex-col items-center justify-center py-12">
                          <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
                          <p className="text-muted-foreground text-center mb-4">Device kuma jiro</p>
                          <Button onClick={() => setShowAddSimDialog(true)}><Plus className="w-4 h-4 mr-2" /> Device Cusub</Button>
                        </CardContent></Card>
                      )}
                      <AddSimDialog open={showAddSimDialog} onOpenChange={setShowAddSimDialog} onSuccess={() => {}} />
                    </div>
                  </TabsContent>
                )}

                {/* Lazy-loaded standalone component tabs */}
                {activeTab === 'transactions-dashboard' && <TabsContent value="transactions-dashboard"><Suspense fallback={<TabLoader />}><TransactionsDashboard /></Suspense></TabsContent>}
                {activeTab === 'send-notification' && <TabsContent value="send-notification"><Suspense fallback={<TabLoader />}><SendNotification /></Suspense></TabsContent>}
                {activeTab === 'online-payments' && <TabsContent value="online-payments"><Suspense fallback={<TabLoader />}><OnlinePaymentsDashboard /></Suspense></TabsContent>}
                {activeTab === 'waafipay-orders' && <TabsContent value="waafipay-orders"><Suspense fallback={<TabLoader />}><WaafiPayDashboard /></Suspense></TabsContent>}
                {activeTab === 'sms-offline-orders' && <TabsContent value="sms-offline-orders"><Suspense fallback={<TabLoader />}><SMSOfflineOrdersDashboard /></Suspense></TabsContent>}
                {activeTab === 'combined-analytics' && <TabsContent value="combined-analytics"><Suspense fallback={<TabLoader />}><CombinedPaymentAnalytics /></Suspense></TabsContent>}
                {activeTab === 'sms-payments' && <TabsContent value="sms-payments"><Suspense fallback={<TabLoader />}><PaymentSmsLog /></Suspense></TabsContent>}
                {activeTab === 'unmatched' && <TabsContent value="unmatched"><Suspense fallback={<TabLoader />}><UnmatchedPayments /></Suspense></TabsContent>}
                {activeTab === 'offline-payment' && <TabsContent value="offline-payment"><Suspense fallback={<TabLoader />}><OfflinePaymentSettings /></Suspense></TabsContent>}
                {activeTab === 'balance' && <TabsContent value="balance"><Suspense fallback={<TabLoader />}><BalanceManagement /></Suspense></TabsContent>}
                {activeTab === 'delivery-rules' && <TabsContent value="delivery-rules"><Suspense fallback={<TabLoader />}><PackageDeliveryRules /></Suspense></TabsContent>}
                {activeTab === 'daily-orders' && <TabsContent value="daily-orders"><Suspense fallback={<TabLoader />}><DailyOrdersManager /></Suspense></TabsContent>}
                {activeTab === 'blocked-users' && <TabsContent value="blocked-users"><Suspense fallback={<TabLoader />}><BlockedUsersManager /></Suspense></TabsContent>}
                {activeTab === 'bulk-sms' && <TabsContent value="bulk-sms"><Suspense fallback={<TabLoader />}><BulkSmsManager /></Suspense></TabsContent>}
                {activeTab === 'auto-topup' && <TabsContent value="auto-topup"><Suspense fallback={<TabLoader />}><AutoTopUpSettings /></Suspense></TabsContent>}
                {activeTab === 'audit-log' && <TabsContent value="audit-log"><Suspense fallback={<TabLoader />}><AuditLogViewer /></Suspense></TabsContent>}
                {activeTab === 'admin-management' && <TabsContent value="admin-management"><Suspense fallback={<TabLoader />}><AdminManagement /></Suspense></TabsContent>}
                {activeTab === 'fraud-alerts' && <TabsContent value="fraud-alerts"><Suspense fallback={<TabLoader />}><FraudAlerts /></Suspense></TabsContent>}
                {activeTab === 'settings' && <TabsContent value="settings"><Suspense fallback={<TabLoader />}><AppSettings /></Suspense></TabsContent>}
                {activeTab === 'ussd-flows' && <TabsContent value="ussd-flows"><Suspense fallback={<TabLoader />}><UssdFlowsManager /></Suspense></TabsContent>}
                {activeTab === 'ussd-learning' && <TabsContent value="ussd-learning"><Suspense fallback={<TabLoader />}><UssdLearningDashboard /></Suspense></TabsContent>}
                {activeTab === 'wholesale-tiers' && <TabsContent value="wholesale-tiers"><Suspense fallback={<TabLoader />}><WholesaleTiersManager /></Suspense></TabsContent>}

                {/* Self-contained data tabs */}
                {activeTab === 'orders' && <TabsContent value="orders"><Suspense fallback={<TabLoader />}><OrdersTab providers={providers} deliveryInstructions={deliveryInstructions} /></Suspense></TabsContent>}
                {activeTab === 'users' && <TabsContent value="users"><Suspense fallback={<TabLoader />}><UsersTab /></Suspense></TabsContent>}
                {activeTab === 'offline-registrations' && <TabsContent value="offline-registrations"><Suspense fallback={<TabLoader />}><OfflineRegistrationsTab providers={providers} /></Suspense></TabsContent>}
                {activeTab === 'outreach' && <TabsContent value="outreach"><Suspense fallback={<TabLoader />}><OutreachDashboard /></Suspense></TabsContent>}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <TabsContent value="notifications" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>🔔 {language === 'so' ? 'Dalabyo Cusub' : 'New Orders'}</CardTitle>
                        <CardDescription>{language === 'so' ? 'Aqbali ama diidi dalabka cusub' : 'Accept or reject new orders'}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {pendingOrders.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase">
                              {language === 'so' ? 'Dalabyo Sugaya' : 'Pending'} ({pendingOrders.length})
                            </h3>
                            <div className="space-y-3">
                              {pendingOrders.map((order) => (
                                <div key={order.id} className="bg-card rounded-lg p-4 border shadow-sm border-l-4 border-l-yellow-500">
                                  <div className="space-y-2 mb-4">
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">📱</span><span className="font-medium">{order.customer_phone}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">📦</span><span className="font-medium">{order.package_name}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">👤</span><span className="font-medium">{order.receiver_phone}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">💰</span><span className="font-medium">${order.selling_price.toFixed(2)}</span></div>
                                    <div className="text-xs text-muted-foreground">🕐 {new Date(order.created_at).toLocaleString()}</div>
                                    <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-3">Lambarkan {order.customer_phone} maka heysaa lacag dhan ${order.selling_price.toFixed(2)}?</p>
                                      <div className="flex gap-2">
                                        <Button onClick={async () => {
                                          const { error } = await supabase.from('orders').update({ status: 'payment_confirmed' }).eq('id', order.id);
                                          if (!error) { setPendingOrders(prev => prev.filter(o => o.id !== order.id)); setConfirmedOrders(prev => [{ ...order, status: 'payment_confirmed' as const }, ...prev]); toast({ title: 'Waa la aqbalay' }); }
                                        }} className="flex-1 bg-green-600 hover:bg-green-700 text-white">✅ HAA</Button>
                                        <Button onClick={async () => {
                                          const { error } = await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
                                          if (!error) { setPendingOrders(prev => prev.filter(o => o.id !== order.id)); toast({ title: 'Waa la diiday' }); }
                                        }} variant="destructive" className="flex-1">❌ MAYA</Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {confirmedOrders.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase">
                              {language === 'so' ? 'La Aqbalay' : 'Confirmed'} ({confirmedOrders.length})
                            </h3>
                            <div className="space-y-3">
                              {confirmedOrders.map((order) => (
                                <div key={order.id} className="bg-card rounded-lg p-4 border shadow-sm border-l-4 border-l-green-500">
                                  <div className="space-y-2 mb-4">
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">📱</span><span className="font-medium">{order.customer_phone}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">📦</span><span className="font-medium">{order.package_name}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">👤</span><span className="font-medium">{order.receiver_phone}</span></div>
                                    <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">💰</span><span className="font-medium">${order.selling_price.toFixed(2)}</span></div>
                                    <div className="flex items-center gap-2 text-xs text-green-600 font-medium">✅ La Aqbalay</div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button onClick={() => {
                                      const instruction = deliveryInstructions.find(d => d.provider_id === order.provider_id);
                                      if (!instruction?.code_template) return;
                                      const priceForUSSD = order.selling_price.toString().replace('.', '*');
                                      let ussdCode = instruction.code_template.replace('{phone}', order.receiver_phone).replace('{receiver_phone}', order.receiver_phone).replace('{price}', priceForUSSD).replace('{amount}', priceForUSSD).replace('{password}', instruction.sim_password || '').replace('{sim_password}', instruction.sim_password || '');
                                      if (!ussdCode.startsWith('*')) ussdCode = '*' + ussdCode;
                                      if (!ussdCode.endsWith('#')) ussdCode = ussdCode + '#';
                                      navigator.clipboard.writeText(ussdCode);
                                      toast({ title: 'Code copied' });
                                    }} variant="outline" className="flex-1"><Copy className="w-4 h-4 mr-2" /> Copy Code</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {pendingOrders.length === 0 && confirmedOrders.length === 0 && (
                          <div className="text-center py-12">
                            <CheckCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground text-lg">{language === 'so' ? 'Wali dalab ma jiro' : 'No orders yet'}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* Delivery Tab */}
                {activeTab === 'delivery' && (
                  <TabsContent value="delivery" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>📦 {language === 'so' ? 'Dir Xirmada' : 'Send Packages'}</CardTitle>
                        <CardDescription>{language === 'so' ? 'Orders diyaar ah in la diro' : 'Orders ready for delivery'}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="Raadi..." className="pl-10" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
                        </div>
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div><p className="text-sm text-muted-foreground">Sugaya</p><p className="text-2xl font-bold text-primary">{confirmedOrders.length}</p></div>
                            <Clock className="h-8 w-8 text-primary" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          {confirmedOrders
                            .filter(o => !orderSearch || o.customer_phone.includes(orderSearch) || o.receiver_phone.includes(orderSearch) || o.package_name.toLowerCase().includes(orderSearch.toLowerCase()))
                            .map((order) => {
                              const provider = providers.find(p => p.id === order.provider_id);
                              return (
                                <Card key={order.id} className="border-2 hover:border-primary/50 transition-colors">
                                  <CardContent className="p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-semibold">📱 {order.customer_phone}</p></div>
                                      <div><p className="text-muted-foreground text-xs">Receiver</p><p className="font-semibold">👤 {order.receiver_phone}</p></div>
                                      <div><p className="text-muted-foreground text-xs">Package</p><p className="font-semibold">📦 {order.package_name}</p></div>
                                      <div><p className="text-muted-foreground text-xs">Qiimaha</p><p className="font-semibold">💰 ${order.selling_price}</p></div>
                                    </div>
                                    <Button onClick={() => sendUSSDCode(order)} className="w-full" size="lg">Dir USSD Code ➜</Button>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          {confirmedOrders.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>Ma jiraan orders diyaar ah</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* Providers Tab */}
                {activeTab === 'providers' && (
                  <TabsContent value="providers" className="space-y-6">
                    <Card>
                      <CardHeader><CardTitle>{language === 'so' ? 'Ku dar Shirkad Cusub' : 'Add Provider'}</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div><Label>Magaca</Label><Input value={newProvider.provider_name} onChange={(e) => setNewProvider({ ...newProvider, provider_name: e.target.value })} /></div>
                          <div><Label>Logo URL</Label><Input value={newProvider.provider_logo} onChange={(e) => setNewProvider({ ...newProvider, provider_logo: e.target.value })} disabled={!!providerLogoFile} /></div>
                          <div><Label>API Endpoint</Label><Input value={newProvider.api_endpoint} onChange={(e) => setNewProvider({ ...newProvider, api_endpoint: e.target.value })} /></div>
                          <div><Label>Promotional Text</Label><Input value={newProvider.promotional_text} onChange={(e) => setNewProvider({ ...newProvider, promotional_text: e.target.value })} /></div>
                          <div><Label>Display Order</Label><Input type="number" value={newProvider.display_order} onChange={(e) => setNewProvider({ ...newProvider, display_order: parseInt(e.target.value) || 0 })} /></div>
                          <div><Label>{language === 'so' ? 'Rate (tusaale 0.16 = 16%)' : 'Rate (e.g. 0.16 = 16%)'}</Label><Input type="number" step="0.01" placeholder="0" value={newProvider.evoucher_rate} onChange={(e) => setNewProvider({ ...newProvider, evoucher_rate: parseFloat(e.target.value) || 0 })} /></div>
                          <div><Label>PIN (SIM Password)</Label><Input placeholder="5516" value={newProvider.sim_password} onChange={(e) => setNewProvider({ ...newProvider, sim_password: e.target.value })} /></div>
                          <div><Label>USSD Delivery Method</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newProvider.ussd_method} onChange={(e) => setNewProvider({ ...newProvider, ussd_method: e.target.value as UssdMethod })}><option value="single_step">Single Step (Short Code)</option><option value="interactive">Interactive (Flow)</option></select></div>
                          {newProvider.ussd_method === 'single_step' ? (
                            <div className="md:col-span-2"><Label>USSD Code Template</Label><Input placeholder="*712*{amount}*{receiver}*{pin}#" value={newProvider.ussd_single_template} onChange={(e) => setNewProvider({ ...newProvider, ussd_single_template: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Placeholders: {'{amount}'}, {'{receiver}'}, {'{pin}'}</p></div>
                          ) : (
                            <div className="md:col-span-2"><Label>USSD Flow</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newProvider.ussd_flow_id} onChange={(e) => setNewProvider({ ...newProvider, ussd_flow_id: e.target.value })}><option value="">Dooro flow…</option>{ussdFlowOptions.filter(f => f.is_enabled).map(f => <option key={f.id} value={f.id}>{f.flow_name} ({f.trigger_code})</option>)}</select></div>
                          )}
                        </div>
                        <Button onClick={addProvider} className="w-full" disabled={uploadingImage}>{uploadingImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Ku dar</Button>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Shirkadaha</CardTitle></CardHeader>
                      <CardContent className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Tartiib</TableHead><TableHead>Magaca</TableHead><TableHead>Status</TableHead><TableHead>API</TableHead><TableHead>Ficilka</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {providers.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map((provider) => (
                              <TableRow key={provider.id}>
                                <TableCell>{provider.display_order || 0}</TableCell>
                                <TableCell className="font-medium">{provider.provider_name}</TableCell>
                                <TableCell><Button variant={provider.is_active ? 'default' : 'outline'} size="sm" onClick={() => toggleProviderStatus(provider.id, provider.is_active)}>{provider.is_active ? 'Active' : 'Inactive'}</Button></TableCell>
                                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{provider.api_endpoint || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { const di = deliveryInstructions.find(d => d.provider_id === provider.id && !d.category_id && !d.package_id); setEditingProviderPin(di?.sim_password || ''); setEditingProvider(provider); setShowProviderEditDialog(true); }}><Edit className="h-4 w-4 text-primary" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteProvider(provider.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* Packages Tab - inline but with lazy data */}
                {activeTab === 'packages' && (
                  <TabsContent value="packages" className="space-y-6">
                    {!packagesLoaded ? <TabLoader /> : (
                      <>
                        <Card>
                          <CardHeader><CardTitle>Ku dar Package Cusub</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div><Label>Shirkadda</Label><select className="w-full p-2 border rounded-md bg-background" value={newPackage.provider_id} onChange={(e) => setNewPackage({ ...newPackage, provider_id: e.target.value, category_id: '' })}><option value="">Dooro</option>{providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}</select></div>
                              <div><Label>Category</Label><select className="w-full p-2 border rounded-md bg-background" value={newPackage.category_id} onChange={(e) => setNewPackage({ ...newPackage, category_id: e.target.value })} disabled={!newPackage.provider_id}><option value="">Dooro</option>{categories.filter(c => !c.provider_id || c.provider_id === newPackage.provider_id).map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                              <div><Label>Magaca</Label><Input value={newPackage.package_name} onChange={(e) => setNewPackage({ ...newPackage, package_name: e.target.value })} /></div>
                              <div><Label>Data</Label><Input value={newPackage.data_amount} onChange={(e) => setNewPackage({ ...newPackage, data_amount: e.target.value })} /></div>
                              <div><Label>Connection Label</Label><Input value={newPackage.connection_type_label} onChange={(e) => setNewPackage({ ...newPackage, connection_type_label: e.target.value })} /></div>
                              <div><Label>Maalmo</Label><Input value={validityDaysInput} onChange={(e) => setValidityDaysInput(e.target.value)} /></div>
                              <div><Label>Cost Price</Label><Input type="number" step="0.01" value={newPackage.cost_price} onChange={(e) => setNewPackage({ ...newPackage, cost_price: parseFloat(e.target.value) })} /></div>
                              <div><Label>Selling Price</Label><Input type="number" step="0.01" value={newPackage.selling_price} onChange={(e) => setNewPackage({ ...newPackage, selling_price: parseFloat(e.target.value) })} /></div>
                              <div><Label>Profit Margin (%)</Label><Input type="number" step="0.1" value={newPackage.profit_margin} onChange={(e) => setNewPackage({ ...newPackage, profit_margin: parseFloat(e.target.value) })} /></div>
                              <div><Label>USSD Delivery Method</Label><select className="w-full p-2 border rounded-md bg-background" value={newPackage.ussd_method} onChange={(e) => setNewPackage({ ...newPackage, ussd_method: e.target.value as UssdMethod | '' })}><option value="">Inherit from category/provider</option><option value="single_step">Single Step (*729)</option><option value="interactive">Interactive (*725)</option></select></div>
                            </div>
                            <Button onClick={addPackage} className="w-full"><Plus className="h-4 w-4 mr-2" /> Ku dar</Button>
                          </CardContent>
                        </Card>

                        {providers.map((provider) => {
                          const providerPackages = packages.filter(pkg => pkg.provider_id === provider.id);
                          if (providerPackages.length === 0) return null;
                          return (
                            <Card key={provider.id} className="border-2">
                              <CardHeader className="bg-primary/5">
                                <CardTitle className="flex items-center gap-3">
                                  {provider.provider_logo && <img src={provider.provider_logo} alt={provider.provider_name} className="h-8 w-8 object-contain rounded" />}
                                  <span>{provider.provider_name}</span>
                                  <span className="text-sm font-normal text-muted-foreground">({providerPackages.length} packages)</span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-6">
                                {categories.filter(c => c.provider_id === provider.id).map((category) => {
                                  const categoryPackages = providerPackages.filter(pkg => pkg.category_id === category.id);
                                  if (categoryPackages.length === 0) return null;
                                  return (
                                    <div key={category.id} className="mb-8 last:mb-0">
                                      <h4 className="text-lg font-semibold text-primary mb-3">{category.category_name} ({categoryPackages.length})</h4>
                                      <div className="overflow-x-auto">
                                        <Table>
                                          <TableHeader><TableRow><TableHead>Package</TableHead><TableHead>Data</TableHead><TableHead>Days</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                          <TableBody>
                                            {categoryPackages.map((pkg) => (
                                              <TableRow key={pkg.id}>
                                                <TableCell className="font-medium">{pkg.package_name}</TableCell>
                                                <TableCell>{pkg.data_amount}</TableCell>
                                                <TableCell>{pkg.validity_days}</TableCell>
                                                <TableCell>${pkg.selling_price}</TableCell>
                                                <TableCell><Button variant={pkg.is_active ? 'default' : 'outline'} size="sm" onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}><Power className="h-3 w-3 mr-1" />{pkg.is_active ? 'On' : 'Off'}</Button></TableCell>
                                                <TableCell>
                                                  <div className="flex gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => { setEditingPackage(pkg); setEditValidityDaysInput(pkg.validity_days.toString()); }}><Edit className="h-4 w-4 text-primary" /></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => deletePackage(pkg.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  );
                                })}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </>
                    )}
                  </TabsContent>
                )}

                {/* Banners Tab */}
                {activeTab === 'banners' && (
                  <TabsContent value="banners" className="space-y-6">
                    {!bannersLoaded ? <TabLoader /> : (
                      <>
                        <Card>
                          <CardHeader><CardTitle>Ku dar Banner Cusub</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className={`border-2 border-dashed rounded-lg p-6 text-center space-y-4 transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'}`}
                              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) processFile(file); }}>
                              <input type="file" id="banner-file-input" accept="image/*,video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) processFile(file); }} className="hidden" />
                              {!selectedFile ? (
                                <div className="space-y-3">
                                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                                  <Button variant="outline" onClick={() => document.getElementById('banner-file-input')?.click()}>
                                    <Upload className="h-4 w-4 mr-2" /> Dooro File
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-3 relative inline-block">
                                  {selectedFile.type.startsWith('video/') ? <video src={previewUrl} className="max-h-40 rounded-lg" controls /> : <img src={previewUrl} alt="Preview" className="max-h-40 rounded-lg" />}
                                  <Button variant="destructive" size="icon" className="absolute -top-2 -right-2" onClick={() => { setSelectedFile(null); setPreviewUrl(''); }}><X className="h-4 w-4" /></Button>
                                </div>
                              )}
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div><Label>Banner URL</Label><Input value={newBanner.banner_image} onChange={(e) => setNewBanner({ ...newBanner, banner_image: e.target.value })} disabled={!!selectedFile} /></div>
                              <div><Label>Alt Text</Label><Input value={newBanner.alt_text} onChange={(e) => setNewBanner({ ...newBanner, alt_text: e.target.value })} /></div>
                              <div><Label>Display Order</Label><Input type="number" value={newBanner.display_order} onChange={(e) => setNewBanner({ ...newBanner, display_order: parseInt(e.target.value) })} /></div>
                              <div><Label>Rotation (seconds)</Label><Input type="number" value={newBanner.rotation_interval || ''} onChange={(e) => setNewBanner({ ...newBanner, rotation_interval: parseInt(e.target.value) || null })} /></div>
                            </div>
                            <Button onClick={addBanner} className="w-full" disabled={uploadingImage}>{uploadingImage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Ku dar</Button>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle>Banners</CardTitle></CardHeader>
                          <CardContent className="overflow-x-auto">
                            <Table>
                              <TableHeader><TableRow><TableHead>Preview</TableHead><TableHead>Type</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {banners.map((banner) => (
                                  <TableRow key={banner.id}>
                                    <TableCell>{banner.media_type === 'video' ? <video src={banner.banner_image} className="h-16 rounded" /> : <img src={banner.banner_image} alt={banner.alt_text || ''} className="h-16 rounded object-cover" />}</TableCell>
                                    <TableCell><Badge variant="outline">{banner.media_type || 'image'}</Badge></TableCell>
                                    <TableCell>{banner.display_order}</TableCell>
                                    <TableCell>{banner.is_active ? <span className="text-green-600">Active</span> : <span className="text-red-600">Inactive</span>}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => toggleBannerStatus(banner.id, banner.is_active)}><Power className="h-4 w-4" /></Button>
                                        <Button variant="destructive" size="sm" onClick={() => deleteBanner(banner.id)}><Trash2 className="h-4 w-4" /></Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </TabsContent>
                )}

                {/* Categories Tab */}
                {activeTab === 'categories' && (
                  <TabsContent value="categories" className="space-y-6">
                    <Card>
                      <CardHeader><CardTitle>Ku dar Category Cusub</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div><Label>Shirkadda</Label><select value={newCategory.provider_id} onChange={(e) => setNewCategory({ ...newCategory, provider_id: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Dooro</option>{providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}</select></div>
                          <div><Label>Magaca</Label><Input value={newCategory.category_name} onChange={(e) => setNewCategory({ ...newCategory, category_name: e.target.value })} /></div>
                          <div><Label>Tartib</Label><Input type="number" value={newCategory.display_order} onChange={(e) => setNewCategory({ ...newCategory, display_order: parseInt(e.target.value) })} /></div>
                          <div><Label>USSD Delivery Method</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newCategory.ussd_method} onChange={(e) => setNewCategory({ ...newCategory, ussd_method: e.target.value as UssdMethod | '' })}><option value="">Inherit from provider</option><option value="single_step">Single Step (*729)</option><option value="interactive">Interactive (*725)</option></select></div>
                        </div>
                        <Button onClick={addCategory} className="w-full" disabled={uploadingImage}><Plus className="h-4 w-4 mr-2" /> Ku dar</Button>
                      </CardContent>
                    </Card>
                    {providers.map(provider => {
                      const providerCategories = categories.filter(c => c.provider_id === provider.id);
                      if (providerCategories.length === 0) return null;
                      return (
                        <Card key={provider.id} className="border-2">
                          <CardHeader className="bg-primary/5">
                            <CardTitle>{provider.provider_name} ({providerCategories.length})</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6 overflow-x-auto">
                            <Table>
                              <TableHeader><TableRow><TableHead>Magaca</TableHead><TableHead>Tartib</TableHead><TableHead>Status</TableHead><TableHead>Ficilka</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {providerCategories.map((category) => (
                                  <TableRow key={category.id}>
                                    <TableCell className="font-medium">{category.category_name}</TableCell>
                                    <TableCell>{category.display_order}</TableCell>
                                    <TableCell><Button variant={category.is_active ? 'default' : 'outline'} size="sm" onClick={() => toggleCategoryStatus(category.id, category.is_active)}>{category.is_active ? 'Active' : 'Inactive'}</Button></TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(category); setShowCategoryEditDialog(true); }}><Edit className="h-4 w-4 text-primary" /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => deleteCategory(category.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </TabsContent>
                )}

                {/* Payment Tab */}
                {activeTab === 'payment' && (
                  <TabsContent value="payment" className="space-y-6">
                    <Card>
                      <CardHeader><CardTitle>Ku dar Payment Provider</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div><Label>Magaca</Label><Input value={newPaymentProvider.provider_name} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, provider_name: e.target.value })} /></div>
                          <div><Label>Logo URL</Label><Input value={newPaymentProvider.provider_logo} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, provider_logo: e.target.value })} /></div>
                          <div><Label>Commission %</Label><Input type="number" step="0.01" value={newPaymentProvider.commission_rate} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, commission_rate: parseFloat(e.target.value) })} /></div>
                          <div><Label>Prefix Code</Label><Input value={newPaymentProvider.prefix_code} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, prefix_code: e.target.value })} maxLength={2} /></div>
                          <div><Label>Payment Number</Label><Input value={newPaymentProvider.payment_number} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, payment_number: e.target.value })} /></div>
                          <div><Label>USSD Template</Label><Input value={newPaymentProvider.ussd_code_template} onChange={(e) => setNewPaymentProvider({ ...newPaymentProvider, ussd_code_template: e.target.value })} /></div>
                        </div>
                        <Button onClick={addPaymentProvider} className="w-full" disabled={uploadingImage}><Plus className="h-4 w-4 mr-2" /> Ku dar</Button>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Payment Providers</CardTitle></CardHeader>
                      <CardContent className="overflow-x-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Magaca</TableHead><TableHead>Prefix</TableHead><TableHead>Number</TableHead><TableHead>USSD</TableHead><TableHead>Commission</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {paymentProviders.map((pp) => (
                              <TableRow key={pp.id}>
                                <TableCell className="font-medium">{pp.provider_name}</TableCell>
                                <TableCell className="font-mono">{pp.prefix_code || '-'}</TableCell>
                                <TableCell className="font-mono">{pp.payment_number || '-'}</TableCell>
                                <TableCell className="text-xs font-mono">{pp.ussd_code_template || '-'}</TableCell>
                                <TableCell>{pp.commission_rate}%</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => { setEditingPaymentProvider(pp); setEditPaymentNumber(pp.payment_number || ''); setEditPrefixCode(pp.prefix_code || ''); setEditUssdTemplate(pp.ussd_code_template || ''); setEditCommissionRate(String(pp.commission_rate)); }}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => deletePaymentProvider(pp.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* Featured Tab */}
                {activeTab === 'featured' && (
                  <TabsContent value="featured" className="space-y-6">
                    {!packagesLoaded || !featuredLoaded ? <TabLoader /> : (
                      <Card>
                        <CardHeader><CardTitle>Xirmadaha Ugu Caansan</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                          <div className="mb-4">
                            <Label>Dooro xirmad</Label>
                            <div className="grid gap-2 mt-2">
                              {packages.filter(pkg => !featuredPackages.find(fp => fp.package_id === pkg.id)).slice(0, 20).map(pkg => {
                                const provider = providers.find(p => p.id === pkg.provider_id);
                                return (
                                  <div key={pkg.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div><p className="font-semibold">{pkg.package_name}</p><p className="text-sm text-muted-foreground">{provider?.provider_name} - ${pkg.selling_price}</p></div>
                                    <Button size="sm" onClick={() => addFeaturedPackage(pkg.id)}><Plus className="h-4 w-4 mr-1" /> Ku dar</Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader><TableRow><TableHead>Package</TableHead><TableHead>Provider</TableHead><TableHead>Price</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {featuredPackages.map((fp) => {
                                  const pkg = packages.find(p => p.id === fp.package_id);
                                  const provider = providers.find(p => p.id === pkg?.provider_id);
                                  if (!pkg) return null;
                                  return (
                                    <TableRow key={fp.id}>
                                      <TableCell><p className="font-medium">{pkg.package_name}</p></TableCell>
                                      <TableCell>{provider?.provider_name}</TableCell>
                                      <TableCell>${pkg.selling_price}</TableCell>
                                      <TableCell><Button variant="destructive" size="sm" onClick={() => removeFeaturedPackage(fp.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                )}

                {/* Error Messages Tab */}
                {activeTab === 'errors' && (
                  <TabsContent value="errors" className="space-y-6">
                    <Card>
                      <CardHeader><CardTitle>Maamulka Fariimaha Khaladka</CardTitle></CardHeader>
                      <CardContent><ErrorMessagesManager /></CardContent>
                    </Card>
                  </TabsContent>
                )}

                {/* Devices Tab - always render DeviceManagement for data */}
                <div className={activeTab === 'devices' ? '' : 'hidden'}>
                  <DeviceManagement onDevicesChange={handleDevicesChange} />
                </div>

                {/* Delivery Instructions (Orders tab) */}
                {activeTab === 'pricing' && (
                  <TabsContent value="pricing" className="space-y-6">
                    {!packagesLoaded || !discountsLoaded ? <TabLoader /> : (
                      <>
                        <Card>
                          <CardHeader><CardTitle>Delivery Codes</CardTitle></CardHeader>
                          <CardContent>
                            {providers.map(provider => {
                              const providerInstructions = deliveryInstructions.filter(i => i.provider_id === provider.id);
                              return (
                                <div key={provider.id} className="mb-8 last:mb-0">
                                  <h3 className="text-lg font-semibold mb-3 border-b pb-2">{provider.provider_name}</h3>
                                  {providerInstructions.length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <Table>
                                        <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Package</TableHead><TableHead>Code</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                          {providerInstructions.map((instruction) => {
                                            const category = categories.find(c => c.id === instruction.category_id);
                                            const pkg = packages.find(p => p.id === instruction.package_id);
                                            return (
                                              <TableRow key={instruction.id}>
                                                <TableCell>{category ? <Badge variant="outline">{category.category_name}</Badge> : <span className="text-xs text-muted-foreground italic">General</span>}</TableCell>
                                                <TableCell>{pkg ? <Badge variant="outline">{pkg.package_name}</Badge> : <span className="text-xs text-muted-foreground italic">All</span>}</TableCell>
                                                <TableCell className="font-mono text-xs">{instruction.code_template || '-'}</TableCell>
                                                <TableCell>
                                                  <div className="flex gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => startEditInstruction(instruction)}><Pencil className="h-4 w-4 text-primary" /></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => deleteDeliveryInstruction(instruction.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  ) : <p className="text-sm text-muted-foreground italic py-4">Ma jiraan code-yo</p>}
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>

                        {/* Add/Edit Delivery Instruction Form */}
                        <Card>
                          <CardHeader><CardTitle>{editingInstructionId ? 'Edit Code' : 'Ku dar Code Cusub'}</CardTitle></CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div><Label>Shirkadda</Label><select className="w-full p-2 border rounded-md bg-background" value={newDeliveryInstruction.provider_id} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, provider_id: e.target.value })}><option value="">Dooro</option>{providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}</select></div>
                              <div><Label>Category</Label><select className="w-full p-2 border rounded-md bg-background" value={newDeliveryInstruction.category_id} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, category_id: e.target.value })}><option value="">Guud (Dhammaan)</option>{categories.filter(c => !newDeliveryInstruction.provider_id || c.provider_id === newDeliveryInstruction.provider_id).map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                              <div><Label>Package (Optional)</Label><select className="w-full p-2 border rounded-md bg-background" value={newDeliveryInstruction.package_id} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, package_id: e.target.value })}><option value="">Dhammaan</option>{packages.filter(p => p.provider_id === newDeliveryInstruction.provider_id).map(p => <option key={p.id} value={p.id}>{p.package_name}</option>)}</select></div>
                              <div><Label>SIM Password</Label><Input value={newDeliveryInstruction.sim_password} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, sim_password: e.target.value })} /></div>
                            </div>
                            <div><Label>Code Template</Label><Input value={newDeliveryInstruction.code_template} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, code_template: e.target.value })} placeholder="*737*{receiver_phone}*{cost_price}*{sim_password}#" className="font-mono" /></div>
                            <div><Label>Notes</Label><Input value={newDeliveryInstruction.notes} onChange={(e) => setNewDeliveryInstruction({ ...newDeliveryInstruction, notes: e.target.value })} /></div>
                            <div className="flex gap-2">
                              <Button onClick={addDeliveryInstruction} className="flex-1">{editingInstructionId ? 'Update' : 'Ku dar'}</Button>
                              {editingInstructionId && <Button variant="outline" onClick={cancelEditInstruction}>Cancel</Button>}
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </TabsContent>
                )}

              </Tabs>
            </div>
          </main>
        </div>
      </div>

      {/* Edit Package Modal */}
      {editingPackage && (
        <Dialog open={!!editingPackage} onOpenChange={() => setEditingPackage(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Package</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Magaca</Label><Input value={editingPackage.package_name} onChange={(e) => setEditingPackage({ ...editingPackage, package_name: e.target.value })} /></div>
                <div><Label>Data</Label><Input value={editingPackage.data_amount} onChange={(e) => setEditingPackage({ ...editingPackage, data_amount: e.target.value })} /></div>
                <div><Label>Category</Label><select className="w-full p-2 border rounded-md bg-background" value={editingPackage.category_id || ''} onChange={(e) => setEditingPackage({ ...editingPackage, category_id: e.target.value })}><option value="">Dooro</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
                <div><Label>Connection Label</Label><Input value={editingPackage.connection_type_label} onChange={(e) => setEditingPackage({ ...editingPackage, connection_type_label: e.target.value })} /></div>
                <div><Label>Maalmo</Label><Input value={editValidityDaysInput} onChange={(e) => setEditValidityDaysInput(e.target.value)} /></div>
                <div><Label>Cost</Label><Input type="number" step="0.01" value={editingPackage.cost_price} onChange={(e) => setEditingPackage({ ...editingPackage, cost_price: parseFloat(e.target.value) })} /></div>
                <div><Label>Price</Label><Input type="number" step="0.01" value={editingPackage.selling_price} onChange={(e) => setEditingPackage({ ...editingPackage, selling_price: parseFloat(e.target.value) })} /></div>
                <div><Label>USSD Delivery Method</Label><select className="w-full p-2 border rounded-md bg-background" value={editingPackage.ussd_method || ''} onChange={(e) => setEditingPackage({ ...editingPackage, ussd_method: (e.target.value || null) as UssdMethod | null })}><option value="">Inherit from category/provider</option><option value="single_step">Single Step (*729)</option><option value="interactive">Interactive (*725)</option></select></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPackage(null)}>Ka noqo</Button>
              <Button onClick={updatePackage}>Badal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Provider Dialog */}
      {editingProvider && (
        <Dialog open={showProviderEditDialog} onOpenChange={() => { setShowProviderEditDialog(false); setEditingProvider(null); setProviderLogoFile(null); setProviderLogoPreview(''); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Badal Shirkadda</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Magaca</Label><Input value={editingProvider.provider_name} onChange={(e) => setEditingProvider({ ...editingProvider, provider_name: e.target.value })} /></div>
              <div><Label>API Endpoint</Label><Input value={editingProvider.api_endpoint || ''} onChange={(e) => setEditingProvider({ ...editingProvider, api_endpoint: e.target.value })} /></div>
              <div><Label>Promotional Text</Label><Input value={editingProvider.promotional_text || ''} onChange={(e) => setEditingProvider({ ...editingProvider, promotional_text: e.target.value })} /></div>
              <div><Label>Display Order</Label><Input type="number" value={editingProvider.display_order || 0} onChange={(e) => setEditingProvider({ ...editingProvider, display_order: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>{language === 'so' ? 'Rate (tusaale 0.16 = 16%)' : 'Rate (e.g. 0.16 = 16%)'}</Label><Input type="number" step="0.01" value={editingProvider.evoucher_rate ?? 0} onChange={(e) => setEditingProvider({ ...editingProvider, evoucher_rate: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>PIN (SIM Password)</Label><Input placeholder="5516" value={editingProviderPin} onChange={(e) => setEditingProviderPin(e.target.value)} /></div>
              <div><Label>USSD Delivery Method</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingProvider.ussd_method || 'single_step'} onChange={(e) => setEditingProvider({ ...editingProvider, ussd_method: e.target.value as UssdMethod })}><option value="single_step">Single Step (Short Code)</option><option value="interactive">Interactive (Flow)</option></select></div>
              {(editingProvider.ussd_method || 'single_step') === 'single_step' ? (
                <div><Label>USSD Code Template</Label><Input placeholder="*712*{amount}*{receiver}*{pin}#" value={editingProvider.ussd_single_template || ''} onChange={(e) => setEditingProvider({ ...editingProvider, ussd_single_template: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Placeholders: {'{amount}'}, {'{receiver}'}, {'{pin}'}</p></div>
              ) : (
                <div><Label>USSD Flow</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingProvider.ussd_flow_id || ''} onChange={(e) => setEditingProvider({ ...editingProvider, ussd_flow_id: e.target.value || null })}><option value="">Dooro flow…</option>{ussdFlowOptions.filter(f => f.is_enabled).map(f => <option key={f.id} value={f.id}>{f.flow_name} ({f.trigger_code})</option>)}</select></div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowProviderEditDialog(false); setEditingProvider(null); }}>Ka noqo</Button>
              <Button onClick={updateProvider} disabled={uploadingImage}>{uploadingImage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Badal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Category Dialog */}
      {editingCategory && (
        <Dialog open={showCategoryEditDialog} onOpenChange={() => { setShowCategoryEditDialog(false); setEditingCategory(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Shirkadda</Label><select value={editingCategory.provider_id || ''} onChange={(e) => setEditingCategory({ ...editingCategory, provider_id: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Dooro</option>{providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}</select></div>
              <div><Label>Magaca</Label><Input value={editingCategory.category_name} onChange={(e) => setEditingCategory({ ...editingCategory, category_name: e.target.value })} /></div>
              <div><Label>Tartib</Label><Input type="number" value={editingCategory.display_order} onChange={(e) => setEditingCategory({ ...editingCategory, display_order: parseInt(e.target.value) })} /></div>
              <div><Label>USSD Delivery Method</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editingCategory.ussd_method || ''} onChange={(e) => setEditingCategory({ ...editingCategory, ussd_method: (e.target.value || null) as UssdMethod | null })}><option value="">Inherit from provider</option><option value="single_step">Single Step (*729)</option><option value="interactive">Interactive (*725)</option></select></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCategoryEditDialog(false); setEditingCategory(null); }}>Ka noqo</Button>
              <Button onClick={updateCategory} disabled={uploadingImage}>{uploadingImage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Badal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* USSD Code Dialog */}
      <Dialog open={showUSSDDialog} onOpenChange={setShowUSSDDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-center">USSD Code Diyaar ah</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {currentOrder && (
              <div className="space-y-2 text-sm border-b pb-4">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span><span className="font-medium">{currentOrder.customer_phone}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Package:</span><span className="font-medium">{currentOrder.package_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Receiver:</span><span className="font-medium">{currentOrder.receiver_phone}</span></div>
              </div>
            )}
            <div className="bg-muted rounded-lg p-6 text-center">
              <p className="text-2xl md:text-3xl font-bold font-mono tracking-wider break-all">{generatedUSSDCode}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={copyUSSDCode} variant="outline" className="flex-1" size="lg"><Copy className="h-4 w-4 mr-2" /> Copy</Button>
            <Button onClick={completeOrderAfterUSSD} className="flex-1" size="lg"><CheckCircle className="h-4 w-4 mr-2" /> Dhameey</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Template Code Edit Dialog */}
      <Dialog open={!!editingTemplateCode} onOpenChange={(open) => { if (!open) { setEditingTemplateCode(null); setQuickTemplateCode(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle><Pencil className="h-5 w-5 text-primary inline mr-2" />Badal Template Code</DialogTitle></DialogHeader>
          {editingTemplateCode && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3"><p className="text-sm font-medium">{editingTemplateCode.packageName}</p></div>
              <div><Label>Template Code Cusub</Label><Input value={quickTemplateCode} onChange={(e) => setQuickTemplateCode(e.target.value)} className="font-mono text-sm mt-1" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingTemplateCode(null); setQuickTemplateCode(''); }}>Ka noqo</Button>
            <Button onClick={saveQuickTemplateCode}><Save className="h-4 w-4 mr-2" /> Kaydi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Provider Dialog */}
      <Dialog open={!!editingPaymentProvider} onOpenChange={(open) => !open && setEditingPaymentProvider(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Badal Payment Provider{editingPaymentProvider && ` - ${editingPaymentProvider.provider_name}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Payment Number</Label><Input value={editPaymentNumber} onChange={(e) => setEditPaymentNumber(e.target.value)} className="font-mono" /></div>
            <div><Label>Prefix Code</Label><Input value={editPrefixCode} onChange={(e) => setEditPrefixCode(e.target.value)} className="font-mono" /></div>
            <div><Label>USSD Template</Label><Input value={editUssdTemplate} onChange={(e) => setEditUssdTemplate(e.target.value)} className="font-mono" /></div>
            <div><Label>Commission %</Label><Input type="number" value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} step="0.1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPaymentProvider(null)}>Ka noqo</Button>
            <Button onClick={updatePaymentProvider}><Save className="h-4 w-4 mr-2" /> Kaydi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Chat */}
      <AdminAIChat />
    </SidebarProvider>
  );
};

export default AdminDashboard;
