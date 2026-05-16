import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Wifi, Smartphone, Clock, Zap, Copy, Check, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dataIcon from '@/assets/mobile-data-icon.png';
import { formatPrice } from '@/lib/utils';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useToast } from '@/hooks/use-toast';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id: string | null;
}

interface DataPackage {
  id: string;
  package_name: string;
  data_amount: string;
  validity_days: string;
  selling_price: number;
  cost_price: number;
  is_active: boolean;
  category_id: string | null;
  connection_type_label: string;
  provider_id: string;
  ussd_code: string | null;
}

const DataPackages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { provider } = useParams<{ provider: string }>();
  const providerName = location.state?.providerName || 'Provider';
  const selectedPackageId = location.state?.selectedPackageId;
  const selectedCategoryId = location.state?.selectedCategoryId;
  const { isReallyOnline } = useConnectivity();
  
  // Get offline context passed from category selection
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';
  
  const [activeTab, setActiveTab] = useState('All');
  const packageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const queryClient = useQueryClient();
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [selectedPackageData, setSelectedPackageData] = useState<any>(null);
  const [ussdCopied, setUssdCopied] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [iosModalData, setIosModalData] = useState<{ ussdCode: string; paymentNumber: string } | null>(null);
  const [iosPaymentCopied, setIosPaymentCopied] = useState(false);
  const [iosUssdCopied, setIosUssdCopied] = useState(false);
  const { queueOrder } = useOfflineSync();
  const { toast } = useToast();
  

  // Show AdMob banner on mount, hide on unmount
  useEffect(() => {
    showBannerAd();
    logScreenView('DataPackages');
    return () => {
      hideBannerAd();
    };
  }, []);

  // Realtime subscription for data_packages_config changes
  useEffect(() => {
    const channel = supabase
      .channel('packages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_packages_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['packages'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Prefetch payment providers immediately
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['paymentProviders'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_active_payment_providers');
        if (error) throw error;
        return data || [];
      },
      staleTime: 30 * 1000,
    });
  }, [queryClient]);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', provider],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_categories');
        if (cached) {
          const allCategories = JSON.parse(cached);
          return provider ? allCategories.filter((c: any) => c.provider_id === provider) : allCategories;
        }
      }
      
      const { data, error } = await supabase.rpc('get_active_categories', { 
        provider_uuid: provider || null 
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!provider,
    staleTime: 30 * 1000,
    retry: false,
    initialData: () => {
      try {
        const cached = localStorage.getItem('offline_categories');
        if (cached) {
          const allCategories = JSON.parse(cached);
          return provider ? allCategories.filter((c: any) => c.provider_id === provider) : allCategories;
        }
      } catch (e) {}
      return [];
    },
  });

  // Get cached packages - self-contained, resolves provider UUID internally
  const getCachedPackages = (): DataPackage[] => {
    try {
      const cached = localStorage.getItem('offline_packages');
      const cachedProviders = localStorage.getItem('offline_providers');
      
      if (!cached) return [];
      
      const allPackages = JSON.parse(cached);
      
      // Resolve provider UUID from URL param
      let actualProviderId: string | null = null;
      
      // If provider param is already a UUID
      if (provider?.includes('-')) {
        actualProviderId = provider;
      } else if (provider && cachedProviders) {
        // Find provider by name in cache
        const providers = JSON.parse(cachedProviders);
        const prov = providers.find((p: any) => 
          p.provider_name.toLowerCase() === provider.toLowerCase() ||
          p.id === provider
        );
        if (prov) {
          actualProviderId = prov.id;
        }
      }
      
      if (!actualProviderId) return [];
      
      return allPackages[actualProviderId] || [];
    } catch (e) {
      console.error('Error loading cached packages:', e);
    }
    return [];
  };

  const { data: packages = [] } = useQuery({
    queryKey: ['packages', provider],
    queryFn: async () => {
      // Try cache first for offline
      const cachedPackages = getCachedPackages();
      
      // If offline, return cache
      if (!isReallyOnline) {
        return cachedPackages;
      }
      
      // If online but no provider UUID, return cache
      if (!provider?.includes('-')) {
        // Try to resolve UUID
        const cachedProviders = localStorage.getItem('offline_providers');
        if (cachedProviders) {
          const providers = JSON.parse(cachedProviders);
          const prov = providers.find((p: any) => 
            p.provider_name.toLowerCase() === provider?.toLowerCase()
          );
          if (prov) {
            const { data, error } = await supabase.rpc('get_public_packages', { provider_uuid: prov.id });
            if (error) return cachedPackages;
            return data || [];
          }
        }
        return cachedPackages;
      }
      
      const { data, error } = await supabase.rpc('get_public_packages', { provider_uuid: provider });
      if (error) return cachedPackages;
      return data || [];
    },
    enabled: !!provider,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    retry: false,
    // Load cached data immediately on mount
    initialData: () => getCachedPackages(),
  });

  const { data: promotionalTextData } = useQuery({
    queryKey: ['promotionalText', provider],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_providers');
        if (cached) {
          const providers = JSON.parse(cached);
          const prov = providers.find((p: any) => p.id === provider);
          return prov?.promotional_text || null;
        }
        return null;
      }
      
      const { data, error } = await supabase
        .from('providers_config')
        .select('promotional_text')
        .eq('id', provider)
        .maybeSingle();
      if (error) throw error;
      return data?.promotional_text;
    },
    enabled: !!provider,
    staleTime: 30 * 1000,
    retry: false,
  });

  const promotionalText = promotionalTextData || 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!';

  const getFilteredPackages = () => {
    // If coming from category selection, filter by that category
    if (selectedCategoryId) {
      return packages.filter(pkg => pkg.category_id === selectedCategoryId);
    }
    
    if (activeTab === 'All') return packages;
    
    const selectedCategory = categories.find(c => c.category_name === activeTab);
    if (!selectedCategory) return packages;
    
    return packages.filter(pkg => pkg.category_id === selectedCategory.id);
  };

  const getSelectedCategoryName = () => {
    if (selectedCategoryId) {
      const category = categories.find(c => c.id === selectedCategoryId);
      return category?.category_name || '';
    }
    return '';
  };

  const filteredPackages = getFilteredPackages();

  // Scroll to selected package when page loads
  useEffect(() => {
    if (selectedPackageId && packageRefs.current[selectedPackageId]) {
      setTimeout(() => {
        packageRefs.current[selectedPackageId]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [selectedPackageId, filteredPackages]);

  const getBrandBackgroundClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud';
      case 'somtel':
        return 'bg-somtel';
      case 'somlink':
        return 'bg-somlink';
      case 'somnet':
        return 'bg-somnet';
      case 'amtel':
        return 'bg-amtel';
      default:
        return 'bg-primary';
    }
  };

  const handlePurchase = (packageData: any) => {
    // Get category name for this package
    const packageCategory = categories.find(c => c.id === packageData.categoryId);
    const categoryName = packageCategory?.category_name || '';
    
    // If offline mode, show confirmation directly
    if (isOffline) {
      setSelectedPackageData(packageData);
      setShowConfirmationScreen(true);
    } else {
      // Online mode: go to payment providers page
      navigate(`/payment/${provider}`, { 
        state: { 
          package: packageData, 
          providerName,
          categoryName // Pass category name for ADSL detection
        } 
      });
    }
  };

  const handleOfflineConfirmPurchase = () => {
    if (!selectedPackageData) return;

    const amount = selectedPackageData.price?.replace('$', '') || '0';
    
    // Determine USSD prefix and payment number based on sender's provider
    const senderPrefix = senderPhone?.substring(0, 2) || '';
    const isSomnet = senderPrefix === '68';
    let iftinPaymentNumber = '617195659';
    let iftinPaymentPrefix = isSomnet ? '*812*' : '*712*';
    
    // Build USSD code correctly without encoding
    const amountFormatted = amount.replace('.', '*');
    const ussdCode = `${iftinPaymentPrefix}${iftinPaymentNumber}*${amountFormatted}#`;
    
    // Create offline order and queue it
    const offlineOrderData = {
      customer_phone: senderPhone,
      sender_phone: senderPhone,
      receiver_phone: receiverPhone,
      package_id: selectedPackageData.id || '',
      provider_id: provider || '',
      payment_provider_id: '',
      package_name: selectedPackageData.name || 'Data Package',
      data_amount: selectedPackageData.data || '',
      selling_price: parseFloat(amount),
      payment_number: iftinPaymentNumber,
      payment_source: 'sms_offline',
      status: 'pending_payment',
      delivery_status: 'pending'
    };
    
    const queuedOrderId = queueOrder(offlineOrderData as any);

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      // iOS: Show modal with copy buttons instead of dialing USSD
      setIosModalData({ ussdCode, paymentNumber: iftinPaymentNumber });
      setShowConfirmationScreen(false);
      setShowIOSModal(true);
    } else {
      // Android: Direct USSD dial
      const link = document.createElement('a');
      link.href = `tel:${ussdCode}`;
      link.click();
      
      setTimeout(() => {
        toast({
          title: "WAX HAKA BEDELIN 😊",
        });
      }, 500);

      setTimeout(() => {
        setShowConfirmationScreen(false);
        navigate('/providers');
      }, 2000);
    }
  };

  const handleIOSCopyPayment = async () => {
    if (!iosModalData) return;
    try {
      await navigator.clipboard.writeText(iosModalData.paymentNumber);
      setIosPaymentCopied(true);
      setTimeout(() => setIosPaymentCopied(false), 2000);
    } catch (e) {
      toast({ title: "Khalad", description: "Ma koobiyeyn karin", variant: "destructive" });
    }
  };

  const handleIOSCopyUssd = async () => {
    if (!iosModalData) return;
    try {
      await navigator.clipboard.writeText(iosModalData.ussdCode);
      setIosUssdCopied(true);
      setTimeout(() => setIosUssdCopied(false), 2000);
    } catch (e) {
      toast({ title: "Khalad", description: "Ma koobiyeyn karin", variant: "destructive" });
    }
  };

  const handleIOSOpenDialer = () => {
    if (!iosModalData) return;
    const link = document.createElement('a');
    link.href = `tel:${iosModalData.paymentNumber}`;
    link.click();
    setTimeout(() => {
      setShowIOSModal(false);
      navigate('/providers');
    }, 1000);
  };

  const handleIOSModalClose = () => {
    setShowIOSModal(false);
    navigate('/providers');
  };

  const getBrandColor = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'text-hormuud';
      case 'somtel':
        return 'text-somtel';
      case 'somlink':
        return 'text-somlink';
      case 'somnet':
        return 'text-somnet';
      case 'amtel':
        return 'text-amtel';
      default:
        return 'text-primary';
    }
  };

  const getBrandButtonClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud hover:bg-hormuud/90';
      case 'somtel':
        return 'bg-somtel hover:bg-somtel/90';
      case 'somlink':
        return 'bg-somlink hover:bg-somlink/90';
      case 'somnet':
        return 'bg-somnet hover:bg-somnet/90';
      case 'amtel':
        return 'bg-amtel hover:bg-amtel/90';
      default:
        return 'bg-primary hover:bg-primary/90';
    }
  };

  const getIcon = (feature: string) => {
    const iconClass = `w-4 h-4 ${getBrandColor(provider || '')}`;
    if (feature.includes('Internet')) return <Wifi className={iconClass} />;
    if (feature.includes('App')) return <Smartphone className={iconClass} />;
    return <Clock className={iconClass} />;
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName)} text-white py-4 px-4`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <h1 className="text-lg font-bold">
              {selectedCategoryId ? getSelectedCategoryName() : 'IFTIN INTERNET'}
            </h1>
            <p className="text-white/80 text-sm">{providerName}</p>
          </div>
          <div className="w-10"></div> {/* Spacer for centering */}
        </div>
      </div>

      {/* Tab Navigation - Only show if not coming from category selection */}
      {!selectedCategoryId && (
        <div className="bg-white border-b">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('All')}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'All'
                  ? `border-${providerName?.toLowerCase() || 'primary'} ${getBrandColor(providerName)} bg-${providerName?.toLowerCase() || 'primary'}/10`
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveTab(category.category_name)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === category.category_name
                    ? `border-${providerName?.toLowerCase() || 'primary'} ${getBrandColor(providerName)} bg-${providerName?.toLowerCase() || 'primary'}/10`
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {category.category_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Promotional Text */}
      <div className="p-4 bg-gray-50">
        <p className="text-sm text-gray-700 text-center">
          {promotionalText}
        </p>
      </div>

      {/* Data Packages */}
      <div className="p-4 space-y-4">
        {filteredPackages.map((pkg) => {
          return (
          <div 
            key={pkg.id} 
            ref={(el) => packageRefs.current[pkg.id] = el}
            className={`bg-white rounded-lg border shadow-sm p-4 transition-all ${
              selectedPackageId === pkg.id ? 'ring-2 ring-primary shadow-lg' : ''
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{pkg.package_name}</h3>
              </div>
              <div className="text-right">
                <span className="text-sm text-destructive line-through mr-2">
                  ${formatPrice(pkg.cost_price)}
                </span>
                <span className={`text-2xl font-bold ${getBrandColor(providerName)}`}>${formatPrice(pkg.selling_price)}</span>
              </div>
            </div>
            <div className={`h-0.5 mb-3 ${getBrandColor(providerName).replace('text-', 'bg-')}`} style={{ width: '100%' }}></div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-5 h-5"
                  style={{
                    WebkitMaskImage: `url(${dataIcon})`,
                    maskImage: `url(${dataIcon})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                  }}
                >
                  <div className={`w-full h-full ${getBrandColor(providerName).replace('text-', 'bg-')}`} />
                </div>
                <span className="text-sm text-muted-foreground">{pkg.data_amount}</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                <span className="text-sm text-muted-foreground">{pkg.connection_type_label || 'Mobile Internet'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                <span className="text-sm text-muted-foreground">{pkg.validity_days}</span>
              </div>
            </div>

            <Button 
              onClick={() => handlePurchase({ 
                id: pkg.id,
                providerId: provider,
                categoryId: pkg.category_id,
                name: pkg.package_name, 
                price: `$${formatPrice(pkg.selling_price)}`,
                data: pkg.data_amount,
                validity: pkg.validity_days,
                ussdCode: pkg.ussd_code
              })}
              className={`w-full ${getBrandButtonClass(providerName)} text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity`}
            >
              IIBSO
            </Button>
          </div>
        )})}
      </div>

      {/* Offline Confirmation Screen */}
      {showConfirmationScreen && isOffline && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            
            {/* Package Details Card */}
            <div className="bg-white dark:bg-card rounded-lg border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedPackageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandColor(providerName)}`}>{selectedPackageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandColor(providerName).replace('text-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Sender Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-lg font-bold text-foreground">+252-{senderPhone}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-lg font-bold text-foreground">+252-{receiverPhone}</span>
              </div>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {selectedPackageData?.price} ka dirtid {senderPhone}?
              </p>
            </div>

            {/* USSD Code with Copy Button */}
            {(() => {
              const amount = selectedPackageData?.price?.replace('$', '') || '0';
              const sp = senderPhone?.substring(0, 2) || '';
              const isSn = sp === '68';
              let iftinPaymentNumber = '617195659';
              let iftinPaymentPrefix = isSn ? '*812*' : '*712*';
              
              const amountFormatted = amount.replace('.', '*');
              const ussdCode = `${iftinPaymentPrefix}${iftinPaymentNumber}*${amountFormatted}#`;
              
              const handleCopyUssd = async () => {
                try {
                  await navigator.clipboard.writeText(ussdCode);
                  setUssdCopied(true);
                  toast({
                    title: "La koobiyeeyey!",
                    description: "USSD code-ka waa la koobiyeeyey",
                    duration: 2000
                  });
                  setTimeout(() => setUssdCopied(false), 2000);
                } catch (e) {
                  toast({
                    title: "Khalad",
                    description: "Ma koobiyeyn karin",
                    variant: "destructive"
                  });
                }
              };
              
              return (
                <div 
                  onClick={handleCopyUssd}
                  className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border cursor-pointer hover:bg-muted/80 transition-colors"
                >
                  <span className="text-lg font-bold text-green-600">{ussdCode}</span>
                  <button className="p-2 hover:bg-background rounded-lg transition-colors">
                    {ussdCopied ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmationScreen(false)} 
                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={handleOfflineConfirmPurchase} 
                className="flex-1 py-5 text-base font-bold bg-green-600 hover:bg-green-700 text-white"
              >
                HADA IIBSO
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* iOS USSD Modal */}
      {showIOSModal && iosModalData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#0a1628' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-xl font-bold" style={{ color: '#D4AF37' }}>Fadlan Lacagta ku dir</h2>
              <button
                onClick={handleIOSModalClose}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white/70" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Payment Number */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-white/50">Lambarka Lacagta loo diraayo</p>
                <div className="flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <span className="text-2xl font-bold text-white tracking-wide">{iosModalData.paymentNumber}</span>
                  <button
                    onClick={handleIOSCopyPayment}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ backgroundColor: iosPaymentCopied ? 'rgba(34,197,94,0.2)' : 'rgba(212,175,55,0.15)', color: iosPaymentCopied ? '#22c55e' : '#D4AF37' }}
                  >
                    {iosPaymentCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {iosPaymentCopied ? 'Waa la copy-gareeyay!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* USSD Code */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-white/50">USSD Code-ka oo buuxa</p>
                <div className="flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <span className="text-lg font-bold text-white">{iosModalData.ussdCode}</span>
                  <button
                    onClick={handleIOSCopyUssd}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ backgroundColor: iosUssdCopied ? 'rgba(34,197,94,0.2)' : 'rgba(212,175,55,0.15)', color: iosUssdCopied ? '#22c55e' : '#D4AF37' }}
                  >
                    {iosUssdCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {iosUssdCopied ? 'Waa la copy-gareeyay!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <p className="text-sm text-white/60 text-center leading-relaxed">
                USSD code-ka copy garee, kadibna dialer-ka ku qor ama batanka hoose taabo.
              </p>

              {/* Open Dialer Button */}
              <button
                onClick={handleIOSOpenDialer}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-lg font-bold transition-all hover:opacity-90"
                style={{ backgroundColor: '#D4AF37', color: '#0a1628' }}
              >
                <Phone className="w-5 h-5" />
                Fur Dialer-ka Taleefanka
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPackages;