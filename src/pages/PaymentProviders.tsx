import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PaymentLoadingOverlay } from '@/components/PaymentLoadingOverlay';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Zap, Clock, Smartphone, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PaymentErrorModal } from '@/components/PaymentErrorModal';
import OfflinePhoneInputSheet from '@/components/OfflinePhoneInputSheet';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { Capacitor } from '@capacitor/core';
interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  prefix_code: string | null;
  ussd_code_template: string | null;
  ussd_prefix: string | null;
  payment_number: string | null;
}
const PaymentProviders = () => {
  const navigate = useNavigate();
  const { isReallyOnline } = useConnectivity();
  const { queueOrder } = useOfflineSync();
  const {
    provider
  } = useParams<{
    provider: string;
  }>();
  const location = useLocation();
  const packageData = location.state?.package;
  const providerName = location.state?.providerName;
  const categoryName = location.state?.categoryName || '';
  
  // Helper function to detect ADSL packages
  const isADSLPackage = (catName: string) => {
    return catName?.toUpperCase().includes('ADSL');
  };
  
  const isADSL = isADSLPackage(categoryName);
  const {
    data: paymentProviders = [],
    isLoading
  } = useQuery({
    queryKey: ['paymentProviders'],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_payment_providers');
        return cached ? JSON.parse(cached) : [];
      }
      
      const {
        data,
        error
      } = await supabase.rpc('get_active_payment_providers');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
    retry: false,
    initialData: () => {
      try {
        const cached = localStorage.getItem('offline_payment_providers');
        return cached ? JSON.parse(cached) : [];
      } catch (e) {
        return [];
      }
    },
  });

  // Fetch delivery instructions for the package's category
  const {
    data: deliveryInstructions = []
  } = useQuery({
    queryKey: ['deliveryInstructions', packageData?.categoryId, packageData?.providerId],
    queryFn: async () => {
      if (!packageData?.categoryId && !packageData?.providerId) return [];
      
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
        return [];
      }
      
      const { data, error } = await supabase
        .from('customer_delivery_instructions')
        .select('*')
        .eq('provider_id', packageData.providerId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!(packageData?.categoryId || packageData?.providerId),
    staleTime: 30 * 1000,
    retry: false,
    initialData: () => {
      try {
        if (!packageData?.providerId) return [];
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
      } catch (e) {}
      return [];
    },
  });

  const [selectedProvider, setSelectedProvider] = useState('');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [receiverNumber, setReceiverNumber] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [buyButtonReady, setBuyButtonReady] = useState(false);
  const [paymentProviderPrefix, setPaymentProviderPrefix] = useState('');
  const [receiverProviderPrefix, setReceiverProviderPrefix] = useState('');
  const [receiverNumberError, setReceiverNumberError] = useState('');
  const [paymentNumberError, setPaymentNumberError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorType, setErrorType] = useState<'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general'>('general');
  const [errorMessage, setErrorMessage] = useState('');
  const [showOfflineSheet, setShowOfflineSheet] = useState(false);
  const isOfflineFromState = location.state?.isOffline;
  const [ussdCodeForDisplay, setUssdCodeForDisplay] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [iosUssdPopup, setIosUssdPopup] = useState<{ open: boolean; ussdCode: string; paymentNumber: string }>({ open: false, ussdCode: '', paymentNumber: '' });
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
  const getProviderFromPrefix = useCallback((phoneNumber: string) => {
    const prefix = phoneNumber.substring(0, 2);
    const firstChar = phoneNumber.substring(0, 1);
    
    // ADSL numbers start with '1' - they are Hormuud
    if (firstChar === '1' && phoneNumber.length === 7) {
      return {
        name: 'Hormuud',
        logo: hormuudLogo
      };
    }
    
    switch (prefix) {
      case '61':
      case '77':
        return {
          name: 'Hormuud',
          logo: hormuudLogo
        };
      case '62':
        return {
          name: 'Somtel',
          logo: somtelLogo
        };
      case '68':
        return {
          name: 'Somnet',
          logo: somnetLogo
        };
      case '63':
      case '65':
        return {
          name: 'Somlink',
          logo: somlinkLogo
        };
      case '71':
        return {
          name: 'Amtel',
          logo: amtelLogo
        };
      default:
        return {
          name: 'Provider',
          logo: ''
        };
    }
  }, []);
  const getProviderPrefix = useCallback((providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return '61';
      case 'somtel':
        return '62';
      case 'somnet':
        return '68';
      case 'somlink':
        return '63';
      case 'amtel':
        return '71';
      default:
        return '';
    }
  }, []);
  const getBrandBackgroundClass = useCallback((providerName: string) => {
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
  }, []);

  // Set receiver prefix when provider is loaded
  React.useEffect(() => {
    if (providerName) {
      if (isADSL) {
        // ADSL numbers start with 1
        setReceiverProviderPrefix('1');
        setReceiverNumber('1');
      } else {
        // Mobile numbers use provider prefix
        const prefix = getProviderPrefix(providerName);
        setReceiverProviderPrefix(prefix);
        setReceiverNumber(prefix);
      }
    }
  }, [providerName, isADSL]);

  // Delay "HAA IIBSO" button by 2 seconds to prevent accidental taps
  React.useEffect(() => {
    if (showConfirmationScreen) {
      setBuyButtonReady(false);
      const timer = setTimeout(() => setBuyButtonReady(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [showConfirmationScreen]);

  // Pre-fill phone numbers from offline mode if available
  React.useEffect(() => {
    if (location.state?.senderPhone) {
      setPaymentNumber(location.state.senderPhone);
    }
    if (location.state?.receiverPhone) {
      setReceiverNumber(location.state.receiverPhone);
    }
  }, [location.state]);
  const handlePaymentSelect = useCallback((paymentId: string) => {
    // Proceed with normal payment flow (works both online and offline)
    setSelectedProvider(paymentId);
    const selectedPayment = paymentProviders.find(p => p.id === paymentId);
    if (selectedPayment) {
      // Use prefix_code from database if available
      const prefix = selectedPayment.prefix_code || getProviderPrefix(selectedPayment.provider_name);
      setPaymentProviderPrefix(prefix);
      setPaymentNumber(prefix);
    }
  }, [paymentProviders, getProviderPrefix]);
  const handlePaymentNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');

    if (value.length <= 9) {
      setPaymentNumber(value);
      
      // Validate if the number starts with the correct prefix
      const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
      const paymentProviderName = selectedPayment?.provider_name;
      
      // EVC (Hormuud) accepts both 61 and 77 prefixes
      const isEVC = paymentProviderName?.toLowerCase() === 'evc' || paymentProviderName?.toLowerCase().includes('evc');
      const isHormuud = paymentProviderName?.toLowerCase() === 'hormuud' || paymentProviderName?.toLowerCase().includes('hormuud');
      
      if (value.length >= 2) {
        if ((isEVC || isHormuud) && (value.startsWith('61') || value.startsWith('77'))) {
          setPaymentNumberError('');
        } else if (paymentProviderPrefix && !value.startsWith(paymentProviderPrefix)) {
          const acceptedPrefixes = (isEVC || isHormuud) ? '61 ama 77' : paymentProviderPrefix;
          setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${acceptedPrefixes})`);
        } else {
          setPaymentNumberError('');
        }
      } else {
        setPaymentNumberError('');
      }
    }
  }, [paymentProviders, selectedProvider, paymentProviderPrefix]);
  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    // ADSL validation: 7 digits, starts with 1
    if (isADSL) {
      if (value.length <= 7) {
        setReceiverNumber(value);
        
        // Validate ADSL number
        if (value.length >= 1 && !value.startsWith('1')) {
          setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        } else {
          setReceiverNumberError('');
        }
      }
    } else {
      // Mobile validation: 9 digits with provider prefix
      if (value.length <= 9) {
        setReceiverNumber(value);
        
        // Validate if the number starts with the correct prefix
        // Hormuud accepts both 61 and 77 prefixes
        const isHormuudProvider = providerName?.toLowerCase() === 'hormuud' || providerName?.toLowerCase().includes('hormuud');
        
        if (value.length >= 2) {
          if (isHormuudProvider && (value.startsWith('61') || value.startsWith('77'))) {
            setReceiverNumberError('');
          } else if (receiverProviderPrefix && !value.startsWith(receiverProviderPrefix)) {
            const acceptedPrefixes = isHormuudProvider ? '61 ama 77' : receiverProviderPrefix;
            setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${acceptedPrefixes})`);
          } else {
            setReceiverNumberError('');
          }
        } else {
          setReceiverNumberError('');
        }
      }
    }
  }, [receiverProviderPrefix, providerName, isADSL]);
  const handleProceedToPayment = useCallback(() => {
    if (!selectedProvider) {
      return;
    }
    setShowPaymentModal(true);
  }, [selectedProvider]);
  const handleShowConfirmation = () => {
    if (!paymentNumber || !receiverNumber) {
      return;
    }
    
    // Validate payment number length (always 9 for payment)
    if (paymentNumber.length !== 9) {
      setPaymentNumberError('Fadlan gali lambarka oo dhan (9 digits)');
      return;
    }
    
    // ADSL receiver validation: 7 digits starting with 1
    if (isADSL) {
      if (receiverNumber.length !== 7) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay 7 lambar');
        return;
      }
      if (!receiverNumber.startsWith('1')) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        return;
      }
    } else {
      // Mobile receiver validation: 9 digits
      if (receiverNumber.length !== 9) {
        setReceiverNumberError('Fadlan gali lambarka oo dhan (9 digits)');
        return;
      }
      
      // Validate receiver number prefix for mobile
      // Hormuud accepts both 61 and 77 prefixes
      const isHormuudReceiver = providerName?.toLowerCase() === 'hormuud' || providerName?.toLowerCase().includes('hormuud');
      
      if (isHormuudReceiver && (receiverNumber.startsWith('61') || receiverNumber.startsWith('77'))) {
        // Valid Hormuud receiver number
      } else if (receiverProviderPrefix && !receiverNumber.startsWith(receiverProviderPrefix)) {
        const acceptedPrefixes = isHormuudReceiver ? '61 ama 77' : receiverProviderPrefix;
        setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${acceptedPrefixes})`);
        return;
      }
    }
    
    // Validate payment number prefix
    const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
    const paymentProviderName = selectedPayment?.provider_name;
    
    // EVC (Hormuud) accepts both 61 and 77 prefixes
    const isEVC = paymentProviderName?.toLowerCase() === 'evc' || paymentProviderName?.toLowerCase().includes('evc');
    const isHormuud = paymentProviderName?.toLowerCase() === 'hormuud' || paymentProviderName?.toLowerCase().includes('hormuud');
    
    if ((isEVC || isHormuud) && (paymentNumber.startsWith('61') || paymentNumber.startsWith('77'))) {
      // Valid EVC/Hormuud number
    } else if (paymentProviderPrefix && !paymentNumber.startsWith(paymentProviderPrefix)) {
      const acceptedPrefixes = (isEVC || isHormuud) ? '61 ama 77' : paymentProviderPrefix;
      setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${acceptedPrefixes})`);
      return;
    }
    
    // Generate USSD code for display on confirmation screen
    const formatUssdAmountForDisplay = (amt: string): string => {
      const numAmount = parseFloat(amt);
      const dollars = Math.floor(numAmount);
      const cents = Math.round((numAmount - dollars) * 100);
      return `${dollars}*${cents.toString().padStart(2, '0')}`;
    };

    const selectedPaymentProvider = paymentProviders.find(p => p.id === selectedProvider);
    const displayAmount = packageData?.price?.replace('$', '') || '0';
    const formattedDisplayAmount = formatUssdAmountForDisplay(displayAmount);
    // USSD prefix + payment number from DB (per-provider), with safe fallbacks
    const resolveUssdPrefix = (p: any): string => {
      if (p?.ussd_prefix) return p.ussd_prefix;
      const name = (p?.provider_name || '').toLowerCase();
      if (name.includes('jeeb')) return '*812*';
      return '*712*'; // EVC / e-Dahab default
    };
    const resolvePaymentNumber = (p: any): string => {
      if (p?.payment_number) return p.payment_number;
      return '617195659';
    };
    const displayUssdPrefix = resolveUssdPrefix(selectedPaymentProvider);
    const displayPaymentNumber = resolvePaymentNumber(selectedPaymentProvider);
    const generatedUssdCode = `${displayUssdPrefix}${displayPaymentNumber}*${formattedDisplayAmount}#`;
    setUssdCodeForDisplay(generatedUssdCode);

    setShowPaymentModal(false);
    setShowConfirmationScreen(true);
  };
  const handlePaymentComplete = async () => {
    const selectedPaymentProvider = paymentProviders.find(p => p.id === selectedProvider);
    const amount = packageData?.price?.replace('$', '') || '0';

  // ========== OFFLINE MODE — INSTANT DIALER (no loading, no UI delay) ==========
    if (!isReallyOnline || isOfflineFromState) {
      console.log('📴 Offline mode — opening dialer immediately');

      // Synchronously compute USSD code (no awaits before tel:)
      const formatUssdAmountOffline = (amt: string): string => {
        const numAmount = parseFloat(amt);
        const dollars = Math.floor(numAmount);
        const cents = Math.round((numAmount - dollars) * 100);
        return `${dollars}*${cents.toString().padStart(2, '0')}`;
      };
      const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
      const ussdPrefix = (selectedPayment?.ussd_prefix)
        || ((selectedPayment?.provider_name || '').toLowerCase().includes('jeeb') ? '*812*' : '*712*');
      const formattedAmount = formatUssdAmountOffline(amount);
      const iftinPaymentNumber = selectedPayment?.payment_number || '617195659';
      const ussdCode = `${ussdPrefix}${iftinPaymentNumber}*${formattedAmount}#`;

      // Hide modal IMMEDIATELY (no async work in front of dialer)
      setShowConfirmationScreen(false);

      // Queue the order in background (non-blocking) so the customer record exists
      try {
        const verifiedPhone = localStorage.getItem('verifiedPhone') || paymentNumber;
        const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
        const offlineOrderData = {
          customer_phone: customerPhone,
          sender_phone: paymentNumber,
          receiver_phone: receiverNumber,
          package_id: packageData?.id || '',
          provider_id: packageData?.providerId || '',
          payment_provider_id: selectedProvider,
          package_name: packageData?.name || 'Data Package',
          data_amount: packageData?.data || '',
          selling_price: parseFloat(amount),
          payment_number: iftinPaymentNumber,
          status: 'pending_payment',
          delivery_status: 'pending',
        };
        setTimeout(() => { try { queueOrder(offlineOrderData as any); } catch (_) {} }, 0);
      } catch (_) { /* never block dialer on this */ }

      if (isIOS) {
        // iOS offline: show popup with USSD code + "Fur Dialer-ka" button
        setIosUssdPopup({ open: true, ussdCode, paymentNumber: iftinPaymentNumber });
        return;
      }

      // Android: OPEN DIALER FIRST — never block on anything else
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
      // Navigate home after the dialer launches
      setTimeout(() => navigate('/'), 600);
      return;
    }
    // ========== END OFFLINE MODE ==========

    try {
      // ========================================
      // USSD ORDER-FIRST APPROACH
      // Step 1: Create order FIRST with pending_payment status
      // ========================================
      console.log('🆕 Creating order with Order-First approach');
      
      const verifiedPhone = localStorage.getItem('verifiedPhone') || paymentNumber;

      // Canonical 9-digit normalization (matches edge function logic)
      const normalizeSomaliPhone = (phone: string): string => {
        let digits = (phone || '').replace(/\D/g, '');
        if (digits.startsWith('252') && digits.length >= 12) digits = digits.substring(3);
        if (digits.startsWith('0') && digits.length === 10) digits = digits.substring(1);
        return digits.slice(-9);
      };

      const customerPhone = normalizeSomaliPhone(verifiedPhone);
      const cleanPaymentNumber = normalizeSomaliPhone(paymentNumber);
      const cleanReceiverPhone = normalizeSomaliPhone(receiverNumber);

      // Get Iftin payment number from app_settings (admin-configured)
      const cachedSettings = localStorage.getItem('offline_app_settings');
      let iftinPaymentNumber = '617195659'; // Fallback default
      let iftinPaymentPrefix = '*712*'; // Fallback default

      // Use payment_number from selected provider's DB row (per-provider)
      iftinPaymentNumber = selectedPaymentProvider?.payment_number || '617195659';

      // ========================================
      // SERVER-SIDE RESERVATION (RPC) with 3s HARD TIMEOUT.
      // Step A: SAVE TO LOCAL QUEUE FIRST (sync, 0ms) — never lose data.
      // Step B: Race RPC vs 3s timeout. Either way → open dialer fast.
      // Step C: If RPC succeeds in time → remove from queue.
      //         If timeout → entry stays; sweeper + usePendingIntentSync retry.
      // ========================================
      const queueKey = 'iftin_pending_intents_queue';
      const queueEntryId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const queueEntryData = {
        verified_phone: customerPhone,
        sender_phone: cleanPaymentNumber,
        receiver_phone: cleanReceiverPhone,
        provider_id: packageData?.providerId,
        package_id: packageData?.id,
        payment_provider: selectedPaymentProvider?.provider_name || '',
        expected_amount: parseFloat(amount),
        status: 'pending',
      };

      // Step A: save to queue immediately (sync, never blocks)
      try {
        const existing = JSON.parse(localStorage.getItem(queueKey) || '[]');
        existing.push({ id: queueEntryId, data: queueEntryData, timestamp: Date.now(), attempts: 0 });
        localStorage.setItem(queueKey, JSON.stringify(existing));
      } catch (_e) { /* ignore */ }

      setIsProcessing(true);
      let intentId: string | null = null;

      // Background reservation runner (continues even if UI proceeds on timeout)
      const reservationRunner = (async (): Promise<string | null> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('create_online_payment_reservation', {
              p_verified_phone: verifiedPhone,
              p_sender_phone: paymentNumber,
              p_receiver_phone: receiverNumber,
              p_provider_id: packageData?.providerId,
              p_package_id: packageData?.id,
              p_payment_provider: selectedPaymentProvider?.provider_name || '',
              p_expected_amount: parseFloat(amount),
            });
            if (!rpcErr && rpcData && (rpcData as any).success) {
              const id = (rpcData as any).intent_id as string;
              console.log('✅ Reservation confirmed (intent_id):', id, 'reused:', (rpcData as any).reused);
              // Remove from queue on success
              try {
                const existing = JSON.parse(localStorage.getItem(queueKey) || '[]');
                const filtered = existing.filter((e: any) => e.id !== queueEntryId);
                localStorage.setItem(queueKey, JSON.stringify(filtered));
              } catch (_e) { /* ignore */ }
              return id;
            }
            console.warn(`⚠️ Reservation attempt ${attempt}/3 failed:`, rpcErr || (rpcData as any)?.error);
          } catch (e) {
            console.warn(`⚠️ Reservation attempt ${attempt}/3 exception:`, e);
          }
          if (attempt < 3) await new Promise(r => setTimeout(r, 400));
        }
        return null;
      })();

      // Step B: race against 3s hard cap
      const RESERVATION_TIMEOUT_MS = 3000;
      const raceResult = await Promise.race([
        reservationRunner.then(id => ({ kind: 'done' as const, id })),
        new Promise<{ kind: 'timeout' }>(r => setTimeout(() => r({ kind: 'timeout' }), RESERVATION_TIMEOUT_MS)),
      ]);

      if (raceResult.kind === 'done' && raceResult.id) {
        intentId = raceResult.id;
      } else {
        console.warn('⏱️ Reservation exceeded 3s cap — proceeding with queue safety net.');
        // Background runner keeps going; usePendingIntentSync + sweeper handle the rest.
      }

      // ========================================
      // Step 2: Generate USSD code (for Android/Web)
      // ========================================
      const formatUssdAmount = (amt: string): string => {
        const numAmount = parseFloat(amt);
        const dollars = Math.floor(numAmount);
        const cents = Math.round((numAmount - dollars) * 100);
        return `${dollars}*${cents.toString().padStart(2, '0')}`;
      };

      const ussdPrefix = (selectedPaymentProvider?.ussd_prefix)
        || ((selectedPaymentProvider?.provider_name || '').toLowerCase().includes('jeeb') ? '*812*' : '*712*');
      const formattedAmount = formatUssdAmount(amount);
      const ussdCode = `${ussdPrefix}${iftinPaymentNumber}*${formattedAmount}#`;
      console.log('📞 USSD Code generated:', ussdCode);

      // ========================================
      // Step 3: ALL platforms (iOS + Android + Web) → open USSD dialer.
      // WaafiPay API removed: iOS gets the same offline-style USSD experience as Android.
      // The reservation (intent_id) above + SMS matcher guarantee zero-unmatched.
      // ========================================
      setIsProcessing(false);
      setShowConfirmationScreen(false);

      if (isIOS) {
        // iOS: show popup with USSD code + "Fur Dialer-ka" button (same as offline UX)
        // tel: with *#  often gets stripped on iOS Safari → user-initiated tap is more reliable
        setIosUssdPopup({ open: true, ussdCode, paymentNumber: iftinPaymentNumber });
        return;
      }

      // Android / Web: open dialer immediately — no further awaits before tel:
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;

      if (Capacitor.isNativePlatform()) {
        navigate('/');
      } else {
        setTimeout(() => navigate('/'), 1200);
      }

    } catch (error: any) {
      console.error('Payment error:', error);
       
      // Dismiss old modal first to prevent overlap
      setIsProcessing(false);
      setShowErrorModal(false);
      setShowConfirmationScreen(false);
      
      // Small delay to ensure old modal is dismissed before showing new one
      setTimeout(() => {
        setErrorType('general');
        setErrorMessage(error.message || 'Khalad ayaa dhacay. Fadlan isku day mar kale.');
        setShowErrorModal(true);
      }, 100);
    }
  };
return <div className="min-h-screen bg-[#efefef] pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName || '')} text-white py-4 px-4`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Dooro habka lacag bixinta</h1>
        </div>
      </div>

      {/* Payment Providers */}
      <div className="p-4 space-y-3 mt-4">
        {isReallyOnline !== true && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              📵 Offline Mode: USSD kaliya ayaa la isticmaali karaa
            </p>
          </div>
        )}
        {paymentProviders
          .map(payment => <div key={payment.id} onClick={() => handlePaymentSelect(payment.id)} className={`bg-white rounded-2xl p-4 flex items-center justify-between cursor-pointer border-2 transition-all shadow-lg hover:shadow-xl ${selectedProvider === payment.id ? 'border-primary shadow-xl scale-105' : 'border-transparent'}`} style={{
        boxShadow: selectedProvider === payment.id ? '0 10px 25px rgba(0, 153, 255, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
              <div className="flex items-center">
                <div className="w-16 h-12 mr-4 flex items-center justify-center bg-gray-50 rounded-lg">
                  {payment.provider_logo && <img src={payment.provider_logo} alt={payment.provider_name} className="w-full h-full object-contain" loading="eager" decoding="async" />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{payment.provider_name}</h3>
                  {isReallyOnline !== true && payment.ussd_code_template && (
                    <p className="text-xs text-muted-foreground">USSD Code</p>
                  )}
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedProvider === payment.id ? 'bg-primary border-primary scale-110' : 'border-muted-foreground'}`}>
                {selectedProvider === payment.id && <Check className="w-5 h-5 text-primary-foreground" />}
              </div>
            </div>)}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-medium mb-4 text-center">
              {paymentProviders.find(p => p.id === selectedProvider)?.provider_name || 'Faahfaahinta lacag bixinta'}
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="payment-number" className="text-sm font-medium text-foreground">Gali Lambarka aad lacagta ka direyso</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="payment-number" 
                  type="tel" 
                  placeholder={paymentProviderPrefix ? `${paymentProviderPrefix}XXXXXXX` : 'XXXXXXXXX'}
                  value={paymentNumber} 
                  onChange={handlePaymentNumberChange} 
                  maxLength={9} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${paymentNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {paymentNumberError && (
                <p className="text-sm text-red-500 font-medium">{paymentNumberError}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receiver-number" className="text-sm font-medium text-foreground">
                {isADSL ? 'Gali Lambarka ADSL-ka (7 lambar bilaabanaya 1)' : 'Gali Lambarka xirmada lagu shubaayo'}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="receiver-number" 
                  type="tel" 
                  placeholder={isADSL ? '1XXXXXX' : (receiverProviderPrefix ? `${receiverProviderPrefix}XXXXXXX` : 'XXXXXXXXX')}
                  value={receiverNumber} 
                  onChange={handleReceiverNumberChange} 
                  maxLength={isADSL ? 7 : 9} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${receiverNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {receiverNumberError && (
                <p className="text-sm text-red-500 font-medium">{receiverNumberError}</p>
              )}
              {isADSL && (
                <p className="text-xs text-muted-foreground">ADSL: 7 lambar, tusaale: 1234567</p>
              )}
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleShowConfirmation} className="flex-1 gradient-button text-white">
                Pay Now
              </Button>
            </div>
          </div>
        </div>}

      {/* Confirmation Screen */}
      {showConfirmationScreen && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            
            {/* Package Details Card */}
            <div className="bg-white dark:bg-card rounded-lg border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{packageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`}>{packageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Payment Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(paymentNumber).logo ? <img src={getProviderFromPrefix(paymentNumber).logo} alt={getProviderFromPrefix(paymentNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(paymentNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{paymentNumber}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(receiverNumber).logo ? <img src={getProviderFromPrefix(receiverNumber).logo} alt={getProviderFromPrefix(receiverNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(receiverNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{receiverNumber}</span>
              </div>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {packageData?.price} ka dirtid {paymentNumber}?
              </p>
            </div>

            {/* USSD Code with Copy Button */}
            <div className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border">
              <code className="text-lg font-bold text-primary select-all">
                {ussdCodeForDisplay}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(ussdCodeForDisplay);
                  toast({
                    title: "La copy-gareeye!",
                    description: "USSD code-ka la copy-gareeye",
                  });
                }}
                className="ml-2"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>

            {/* Processing Indicator */}
            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowConfirmationScreen(false);
                  setShowPaymentModal(true);
                }} 
                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={handlePaymentComplete} 
                disabled={!buyButtonReady || isProcessing}
                className="flex-1 py-5 text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 {isProcessing ? 'Hubinaya...' : buyButtonReady ? 'HAA IIBSO' : 'Sug...'}
              </Button>
            </div>
          </div>
        </div>}

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-8 bg-[#efefef]">
        <Button onClick={handleProceedToPayment} className="w-full gradient-button text-white font-semibold py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">
          {selectedProvider ? `Bixi Hada ${packageData?.price}` : 'Dooro habka lacag bixinta'}
        </Button>
      </div>

      {/* Payment Error Modal */}
      <PaymentErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
          setShowConfirmationScreen(true);
        }}
        errorType={errorType}
        errorMessage={errorMessage}
      />

      {/* Offline Phone Input Sheet */}
      <OfflinePhoneInputSheet 
        open={showOfflineSheet} 
        onOpenChange={setShowOfflineSheet}
      />

      {/* Full-screen loading overlay */}
      <PaymentLoadingOverlay isLoading={isProcessing} />

      {/* iOS USSD Popup — manual dialer trigger (iOS strips * and # from tel:) */}
      {iosUssdPopup.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#0a1628' }}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-xl font-bold" style={{ color: '#D4AF37' }}>Fadlan Lacagta ku dir</h2>
              <button
                onClick={() => {
                  setIosUssdPopup({ open: false, ussdCode: '', paymentNumber: '' });
                }}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/70"
                aria-label="Xidh"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* USSD Code (copy only — iOS won't dial * and #) */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-white/50">USSD Code-ka oo buuxa</p>
                <div className="flex items-center justify-between rounded-xl p-4" style={{ backgroundColor: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                  <code className="text-lg font-bold text-white select-all break-all">{iosUssdPopup.ussdCode}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(iosUssdPopup.ussdCode);
                      toast({ title: 'La copy-gareeye!', description: 'USSD code-ka la copy-gareeye' });
                    }}
                    className="ml-2 shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-white/60 text-center leading-relaxed">
                USSD code-ka copy garee, kadibna dialer-ka ku qor ama batanka hoose taabo.
              </p>

              {/* Open Dialer Button — opens phone dialer to dealer payment number directly */}
              <button
                onClick={() => {
                  // iOS Phone app cannot dial * and # — open dialer with bare payment number.
                  // User pastes the copied USSD code into the dialer themselves.
                  window.location.href = `tel:${iosUssdPopup.paymentNumber}`;
                  // Do NOT navigate away — keep popup so user can copy USSD if needed
                }}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-lg font-bold transition-all hover:opacity-90"
                style={{ backgroundColor: '#D4AF37', color: '#0a1628' }}
              >
                📞 Fur Dialer-ka Taleefanka
              </button>
            </div>
          </div>
        </div>
      )}
    </div>;
};
export default PaymentProviders;