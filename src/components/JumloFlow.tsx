import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ArrowLeft, Send, Layers, Crown, Gem, Sparkles, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';

interface Tier {
  id: string;
  tier_name: string;
  min_amount: number;
  max_amount: number;
  profit_rate: number;
}

interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  payment_number: string | null;
  ussd_prefix: string | null;
  prefix_code: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  brandColor: string;
}

type Step = 'tier' | 'amount' | 'method' | 'phones';

const formatUssdAmount = (amt: number) => {
  const dollars = Math.floor(amt);
  const cents = Math.round((amt - dollars) * 100);
  return `${dollars}*${cents.toString().padStart(2, '0')}`;
};

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

export const JumloFlow: React.FC<Props> = ({ open, onClose, providerId, providerName, brandColor }) => {
  const [step, setStep] = useState<Step>('tier');
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [paymentPhone, setPaymentPhone] = useState(localStorage.getItem('jumloPayPhone') || '');
  const [dataPhone, setDataPhone] = useState(localStorage.getItem('jumloDataPhone') || '');
  const [iosPopup, setIosPopup] = useState<{ open: boolean; ussd: string }>({ open: false, ussd: '' });

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('tier');
      setSelectedTierId(null);
      setAmount('');
      setSelectedMethodId(null);
    }
  }, [open]);

  const { data: tiers = [] } = useQuery<Tier[]>({
    queryKey: ['wholesaleTiers', providerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_provider_wholesale_tiers', { provider_uuid: providerId });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: open && !!providerId,
    staleTime: 60_000,
  });

  const { data: paymentMethods = [] } = useQuery<PaymentProvider[]>({
    queryKey: ['jumloPaymentMethods'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_payment_providers');
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Auto-skip tier selection when only one tier exists
  useEffect(() => {
    if (open && step === 'tier' && tiers.length === 1) {
      setSelectedTierId(tiers[0].id);
      setStep('amount');
    }
  }, [open, step, tiers]);

  const selectedTier = useMemo(
    () => tiers.find((t) => t.id === selectedTierId) || null,
    [tiers, selectedTierId]
  );

  const numericAmount = parseFloat(amount) || 0;
  const inRange = selectedTier
    ? numericAmount >= Number(selectedTier.min_amount) && numericAmount <= Number(selectedTier.max_amount)
    : false;
  const youReceive = selectedTier && inRange
    ? +(numericAmount + (numericAmount * Number(selectedTier.profit_rate)) / 100).toFixed(2)
    : 0;

  const handleSelectTier = (id: string) => {
    setSelectedTierId(id);
    setAmount('');
    setStep('amount');
  };

  const handleProceed = () => {
    if (!selectedTier || !inRange) {
      toast({
        title: 'Qiimo khaldan',
        description: `Geli qadar u dhexeysa ${Number(selectedTier?.min_amount ?? 0)} - ${Number(selectedTier?.max_amount ?? 0)}`,
        duration: 2500,
      });
      return;
    }
    setStep('method');
  };

  const handleSelectMethod = (id: string) => {
    setSelectedMethodId(id);
    setStep('phones');
  };

  const selectedMethod = paymentMethods.find((m) => m.id === selectedMethodId);

  const [submitting, setSubmitting] = useState(false);

  const handleGenerateUssd = async () => {
    if (paymentPhone.length !== 9) {
      toast({ title: 'Lambar khaldan', description: 'Geli 9 lambar oo Payment Phone ah', duration: 2500 });
      return;
    }
    if (dataPhone.length !== 9) {
      toast({ title: 'Lambar khaldan', description: 'Geli 9 lambar oo Data Phone ah', duration: 2500 });
      return;
    }
    if (!selectedMethod || !selectedTier) return;

    localStorage.setItem('jumloPayPhone', paymentPhone);
    localStorage.setItem('jumloDataPhone', dataPhone);

    const ussdPrefix =
      selectedMethod.ussd_prefix ||
      ((selectedMethod.provider_name || '').toLowerCase().includes('jeeb') ? '*812*' : '*712*');
    const iftinNumber = selectedMethod.payment_number || '617195659';
    const formattedAmount = formatUssdAmount(numericAmount);
    const ussdCode = `${ussdPrefix}${iftinNumber}*${formattedAmount}#`;

    setSubmitting(true);

    // ===== IRON WALL: reserve jumlo intent before opening dialer =====
    // Race RPC against 3s timeout; on timeout fall back to local queue safety net.
    let reserved = false;
    try {
      const verifiedPhone = localStorage.getItem('verifiedPhone') || paymentPhone;
      const rpcPromise = supabase.rpc('create_jumlo_payment_reservation', {
        p_verified_phone: verifiedPhone,
        p_sender_phone: paymentPhone,
        p_data_phone: dataPhone,
        p_provider_id: providerId,
        p_tier_id: selectedTier.id,
        p_payment_provider: selectedMethod.provider_name,
        p_expected_amount: numericAmount,
        p_topup_amount: youReceive,
      });
      const result: any = await Promise.race([
        rpcPromise,
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 3000)),
      ]);
      if (!result?.__timeout && !result?.error) reserved = true;
      else console.warn('Jumlo reservation race fallback:', result?.error || 'timeout');
    } catch (e) {
      console.warn('Jumlo reservation failed:', e);
    }

    // Local safety net (admin can re-sync if RPC failed)
    try {
      const queue = JSON.parse(localStorage.getItem('jumlo_intents_queue') || '[]');
      queue.push({
        provider_id: providerId,
        provider_name: providerName,
        tier_id: selectedTier.id,
        payment_method: selectedMethod.provider_name,
        payment_number: paymentPhone,
        data_number: dataPhone,
        amount: numericAmount,
        you_receive: youReceive,
        ussd_code: ussdCode,
        reserved,
        timestamp: Date.now(),
      });
      localStorage.setItem('jumlo_intents_queue', JSON.stringify(queue.slice(-50)));
    } catch (_) {}

    setSubmitting(false);
    onClose();

    if (isIOS()) {
      setIosPopup({ open: true, ussd: ussdCode });
      return;
    }
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
  };

  if (!open && !iosPopup.open) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom">
            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between text-white" style={{ backgroundColor: brandColor }}>
              <div className="flex items-center gap-2">
                {step !== 'tier' && (
                  <button
                    onClick={() => {
                      if (step === 'phones') setStep('method');
                      else if (step === 'method') setStep('amount');
                      else if (step === 'amount') setStep(tiers.length > 1 ? 'tier' : 'tier');
                    }}
                    className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className="font-bold text-lg">
                  {step === 'tier' && providerName}
                  {step === 'amount' && 'Geli Qiimaha'}
                  {step === 'method' && 'Habka Lacag-bixinta'}
                  {step === 'phones' && (selectedMethod?.provider_name || 'Lambarada')}
                </h3>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {/* STEP 0: TIER SELECTION */}
              {step === 'tier' && (
                <>
                  {tiers.length === 0 ? (
                    <div className="py-8 flex flex-col items-center text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin mb-2" />
                      <p className="text-sm">Soo dejinaya tiers...</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-700 mb-3">Dooro Tier</p>
                      <div className="space-y-2.5">
                        {tiers.map((t, idx) => {
                          // Pick an icon based on tier size (max amount) so users can recognize at a glance
                          const max = Number(t.max_amount);
                          const TierIcon =
                            max >= 1000 ? Crown :
                            max >= 500 ? Gem :
                            max >= 100 ? Sparkles :
                            max >= 50 ? Zap :
                            Layers;
                          const tierLabel = `T${idx + 1}`;
                          return (
                            <button
                              key={t.id}
                              onClick={() => handleSelectTier(t.id)}
                              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 ring-1 ring-gray-200 border-l-4 transition text-left active:scale-[0.99]"
                              style={{ borderLeftColor: brandColor }}
                            >
                              {/* Icon thumbnail with tier badge */}
                              <div className="relative shrink-0">
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm"
                                  style={{ backgroundColor: brandColor }}
                                >
                                  <TierIcon className="w-6 h-6" />
                                </div>
                                <span
                                  className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white ring-2 ring-white shadow"
                                  style={{ color: brandColor }}
                                >
                                  {tierLabel}
                                </span>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-800 truncate">
                                  {providerName} - {t.tier_name}
                                </p>
                                <p className="text-sm text-gray-500 mt-0.5">
                                  {Number(t.min_amount)} · ilaa · {Number(t.max_amount)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-2xl font-extrabold" style={{ color: brandColor }}>
                                  {Number(t.profit_rate)}%
                                </p>
                                <p className="text-xs text-gray-400">Rate</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* STEP 1: AMOUNT */}
              {step === 'amount' && selectedTier && (
                <>
                  <div className="bg-gray-100 rounded-xl px-4 py-3 mb-4 text-center text-sm text-gray-600">
                    {selectedTier.tier_name} ·{' '}
                    <span className="font-bold" style={{ color: brandColor }}>
                      {Number(selectedTier.min_amount)} - {Number(selectedTier.max_amount)}
                    </span>{' '}
                    · {Number(selectedTier.profit_rate)}%
                  </div>

                  <label className="block text-sm font-semibold text-gray-700 mb-1">Geli Qiimaha</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-current outline-none text-base"
                    style={{ color: brandColor }}
                    autoFocus
                  />

                  {numericAmount > 0 && inRange && (
                    <div className="mt-4 border-2 border-dashed rounded-xl py-4 text-center" style={{ borderColor: brandColor }}>
                      <p className="text-sm text-gray-500">You will receive:</p>
                      <p className="text-3xl font-extrabold mt-1" style={{ color: brandColor }}>
                        ${youReceive}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Rate: {Number(selectedTier.profit_rate)}%</p>
                    </div>
                  )}

                  <button
                    onClick={handleProceed}
                    disabled={!inRange}
                    className="mt-5 w-full text-white font-bold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                    style={{ backgroundColor: brandColor }}
                  >
                    Proceed to Payment
                  </button>
                </>
              )}

              {/* STEP 2: PAYMENT METHOD */}
              {step === 'method' && (
                <>
                  <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      Amount: <span className="font-semibold text-gray-800">${numericAmount}</span> → You receive:{' '}
                      <span className="font-semibold text-gray-800">${youReceive}</span>
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-gray-700 mb-2">Select Payment Method</p>
                  {paymentMethods.length === 0 ? (
                    <div className="py-8 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentMethods.map((m) => {
                        const prefix =
                          m.ussd_prefix ||
                          ((m.provider_name || '').toLowerCase().includes('jeeb') ? '*812*' : '*712*');
                        return (
                          <button
                            key={m.id}
                            onClick={() => handleSelectMethod(m.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 ring-1 ring-gray-200 transition text-left"
                          >
                            {m.provider_logo ? (
                              <img src={m.provider_logo} alt={m.provider_name} className="w-12 h-10 object-contain rounded" />
                            ) : (
                              <div
                                className="w-12 h-10 rounded flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: brandColor }}
                              >
                                {m.provider_name.slice(0, 3).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800">{m.provider_name}</p>
                              <p className="text-xs text-gray-500">
                                {prefix}
                                {m.payment_number || '617195659'}*
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* STEP 3: PHONES */}
              {step === 'phones' && selectedMethod && (
                <>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Phone Number</label>
                  <div className="flex gap-2 mb-4">
                    <span className="px-4 py-3 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 ring-1 ring-gray-200">
                      +252
                    </span>
                    <input
                      inputMode="numeric"
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      placeholder="612345678"
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-current outline-none text-base"
                      style={{ color: brandColor }}
                    />
                  </div>

                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data Phone Number</label>
                  <div className="flex gap-2 mb-5">
                    <span className="px-4 py-3 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 ring-1 ring-gray-200">
                      +252
                    </span>
                    <input
                      inputMode="numeric"
                      value={dataPhone}
                      onChange={(e) => setDataPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      placeholder="612345678"
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-current outline-none text-base"
                      style={{ color: brandColor }}
                    />
                  </div>

                  <button
                    onClick={handleGenerateUssd}
                    disabled={submitting}
                    className="w-full text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
                    style={{ backgroundColor: brandColor }}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? 'Diyaarinaya...' : 'Generate USSD Code'}
                  </button>
                </>
              )}

              <button
                onClick={onClose}
                className="w-full mt-3 py-3 text-center text-gray-600 font-medium hover:bg-gray-50 rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS USSD popup */}
      {iosPopup.open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2">USSD Code</h3>
            <div className="bg-gray-100 rounded-xl p-4 text-center font-mono text-lg break-all">{iosPopup.ussd}</div>
            <a
              href={`tel:${encodeURIComponent(iosPopup.ussd)}`}
              onClick={() => setIosPopup({ open: false, ussd: '' })}
              className="mt-4 block w-full text-white font-bold py-3 rounded-xl text-center"
              style={{ backgroundColor: brandColor }}
            >
              Fur Dialer-ka
            </a>
            <button
              onClick={() => setIosPopup({ open: false, ussd: '' })}
              className="mt-2 w-full py-2 text-gray-600"
            >
              Xir
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default JumloFlow;
