import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Zap, PenLine } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Provider {
  id: string;
  provider_name: string;
}

interface Package {
  id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  ussd_code: string | null;
  category_id: string | null;
}

interface AddManualDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceName: string;
  simSlot: 1 | 2;
  providerName: string;
  onSuccess: () => void;
}

// Format amount for USSD code
const formatAmountForUssd = (amount: number) => {
  if (Number.isInteger(amount)) return amount.toString();
  const formatted = Number(amount).toFixed(2);
  if (amount < 1) return formatted.replace('.', '');
  return formatted.replace('.', '*');
};

// Normalize phone to 9 digits
const normalizePhoneForUssd = (phone: string): string => {
  let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
  if (p.startsWith('252')) p = p.substring(3);
  return p.slice(-9);
};

// Normalize provider name to slug
const normalizeProviderSlug = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('hormuud')) return 'hormuud';
  if (lower.includes('somnet')) return 'somnet';
  if (lower.includes('somtel')) return 'somtel';
  if (lower.includes('amtel')) return 'amtel';
  if (lower.includes('somlink')) return 'somlink';
  return lower.split(' ')[0];
};

export const AddManualDeliveryDialog: React.FC<AddManualDeliveryDialogProps> = ({
  open,
  onOpenChange,
  deviceId,
  deviceName,
  simSlot,
  providerName,
  onSuccess,
}) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  // Form state
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [autoDeliver, setAutoDeliver] = useState(true); // Default: auto-deliver

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');
      
      if (data) {
        setProviders(data);
        const matchingProvider = data.find(
          p => p.provider_name.toLowerCase() === providerName.toLowerCase()
        );
        if (matchingProvider) {
          setSelectedProviderId(matchingProvider.id);
        }
      }
    };

    if (open) {
      loadProviders();
    }
  }, [open, providerName]);

  // Load packages when provider changes
  useEffect(() => {
    const loadPackages = async () => {
      if (!selectedProviderId) {
        setPackages([]);
        return;
      }

      setLoadingPackages(true);
      const { data } = await supabase
        .from('data_packages_config')
        .select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id')
        .eq('provider_id', selectedProviderId)
        .eq('is_active', true)
        .order('selling_price');

      if (data) {
        setPackages(data);
      }
      setLoadingPackages(false);
    };

    loadPackages();
  }, [selectedProviderId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedPackageId('');
      setReceiverPhone('');
      setSenderPhone('');
      setDeliveryDate(new Date());
      setNotes('');
      setAutoDeliver(true);
    }
  }, [open]);

  // Build USSD code from delivery instructions
  const buildUssdCode = async (pkg: Package, provider: Provider, formattedReceiverPhone: string): Promise<string | null> => {
    // Try package-specific instruction first
    let instruction: { code_template: string; sim_password: string | null } | null = null;

    const { data: pkgInstr } = await supabase
      .from('delivery_instructions')
      .select('code_template, sim_password')
      .eq('provider_id', provider.id)
      .eq('package_id', pkg.id)
      .maybeSingle();
    
    if (pkgInstr?.code_template) {
      instruction = pkgInstr;
    }

    // Try category instruction
    if (!instruction && pkg.category_id) {
      const { data: catInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', provider.id)
        .eq('category_id', pkg.category_id)
        .is('package_id', null)
        .maybeSingle();
      
      if (catInstr?.code_template) {
        instruction = catInstr;
      }
    }

    // Fall back to provider default
    if (!instruction) {
      const { data: provInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', provider.id)
        .is('category_id', null)
        .is('package_id', null)
        .maybeSingle();
      
      if (provInstr?.code_template) {
        instruction = provInstr;
      }
    }

    if (!instruction?.code_template) return null;

    const receiverForUssd = normalizePhoneForUssd(formattedReceiverPhone);
    const costPriceFormatted = formatAmountForUssd(Number(pkg.cost_price));

    return instruction.code_template
      .replace('{receiver_phone}', receiverForUssd)
      .replace('{package_code}', pkg.ussd_code || '')
      .replace('{cost_price}', costPriceFormatted)
      .replace('{sim_password}', instruction.sim_password || '5516');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProviderId) {
      toast({ title: language === 'so' ? 'Fadlan dooro provider' : 'Please select a provider', variant: 'destructive' });
      return;
    }
    if (!selectedPackageId) {
      toast({ title: language === 'so' ? 'Fadlan dooro package' : 'Please select a package', variant: 'destructive' });
      return;
    }
    if (!receiverPhone || receiverPhone.length < 9) {
      toast({ title: language === 'so' ? 'Fadlan geli numberka saxda ah' : 'Please enter a valid phone number', variant: 'destructive' });
      return;
    }

    // For record-only mode, date cannot be in the future
    if (!autoDeliver && deliveryDate > new Date()) {
      toast({ title: language === 'so' ? 'Taariikhdu ma noqon kartid mustaqbalka' : 'Date cannot be in the future', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const selectedPackage = packages.find(p => p.id === selectedPackageId);
      const selectedProvider = providers.find(p => p.id === selectedProviderId);

      if (!selectedPackage || !selectedProvider) throw new Error('Package or provider not found');

      const { data: paymentProvider } = await supabase
        .from('payment_providers_config')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!paymentProvider) throw new Error('No payment provider found');

      let formattedReceiverPhone = receiverPhone.replace(/\D/g, '');
      if (!formattedReceiverPhone.startsWith('252')) {
        formattedReceiverPhone = '252' + formattedReceiverPhone;
      }

      let formattedSenderPhone = senderPhone.replace(/\D/g, '');
      if (formattedSenderPhone && !formattedSenderPhone.startsWith('252')) {
        formattedSenderPhone = '252' + formattedSenderPhone;
      }

      if (autoDeliver) {
        // === AUTO-DELIVER MODE: Queue for automatic USSD delivery ===
        const providerSlug = normalizeProviderSlug(selectedProvider.provider_name);

        // Check if this package has linked delivery rules
        const { data: deliveryRules } = await supabase
          .from('package_delivery_rules')
          .select('*')
          .eq('source_package_id', selectedPackageId)
          .eq('is_active', true)
          .order('execution_order');

        // Collect target packages to deliver
        interface DeliveryTarget {
          pkg: Package;
          count: number;
        }
        const deliveryTargets: DeliveryTarget[] = [];

        if (deliveryRules && deliveryRules.length > 0) {
          // Linked packages: fetch all target packages
          const targetIds = deliveryRules.map(r => r.target_package_id);
          const { data: targetPkgs } = await supabase
            .from('data_packages_config')
            .select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id')
            .in('id', targetIds);

          if (!targetPkgs || targetPkgs.length === 0) {
            toast({
              title: language === 'so' ? 'Target packages lama helin' : 'Target packages not found',
              variant: 'destructive',
            });
            setLoading(false);
            return;
          }

          for (const rule of deliveryRules) {
            const targetPkg = targetPkgs.find(p => p.id === rule.target_package_id);
            if (targetPkg) {
              deliveryTargets.push({ pkg: targetPkg, count: rule.delivery_count });
            }
          }
        } else {
          // No linked rules: send the source package directly
          deliveryTargets.push({ pkg: selectedPackage, count: 1 });
        }

        // Build USSD codes for all targets
        const queueEntries: Array<{
          ussdCode: string;
          pkg: Package;
        }> = [];

        for (const target of deliveryTargets) {
          const ussdCode = await buildUssdCode(target.pkg, selectedProvider, formattedReceiverPhone);
          if (!ussdCode) {
            toast({
              title: language === 'so' ? 'USSD code la heli waayay' : 'No USSD code found',
              description: language === 'so' 
                ? `${target.pkg.package_name} - Delivery instruction lama helin` 
                : `${target.pkg.package_name} - No delivery instruction found`,
              variant: 'destructive',
            });
            setLoading(false);
            return;
          }
          for (let i = 0; i < target.count; i++) {
            queueEntries.push({ ussdCode, pkg: target.pkg });
          }
        }

        // Create order as pending
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            provider_id: selectedProviderId,
            package_id: selectedPackageId,
            package_name: selectedPackage.package_name,
            data_amount: selectedPackage.data_amount,
            selling_price: selectedPackage.selling_price,
            receiver_phone: formattedReceiverPhone,
            sender_phone: formattedSenderPhone || null,
            customer_phone: formattedSenderPhone || formattedReceiverPhone,
            payment_number: 'MANUAL',
            payment_provider_id: paymentProvider.id,
            status: 'completed',
            delivery_status: 'pending',
            payment_source: 'manual',
            is_manual: true,
            delivery_notes: notes || `Auto-delivery (${queueEntries.length} USSD${queueEntries.length > 1 ? 's' : ''})`,
          })
          .select('id')
          .single();

        if (orderError) throw orderError;

        // Queue all delivery entries
        const queueRows = queueEntries.map(entry => ({
          order_id: order.id,
          receiver_phone: formattedReceiverPhone,
          provider_name: providerSlug,
          ussd_code: entry.ussdCode,
          package_code: entry.pkg.ussd_code || null,
          sim_slot: simSlot === 1 ? 0 : 1,
          status: 'pending' as const,
        }));

        const { error: queueError } = await supabase
          .from('delivery_queue')
          .insert(queueRows);

        if (queueError) throw queueError;

        const linkedInfo = deliveryRules && deliveryRules.length > 0 
          ? ` (${queueEntries.length} linked deliveries)` 
          : '';

        toast({
          title: language === 'so' ? '📬 Queue-ga ayaa loo diray' : '📬 Queued for delivery',
          description: language === 'so' 
            ? `${selectedPackage.package_name} → ${formattedReceiverPhone}${linkedInfo} — Android-ku wuu qaadan doonaa`
            : `${selectedPackage.package_name} → ${formattedReceiverPhone}${linkedInfo} — Android will pick it up`,
        });

      } else {
        // === RECORD-ONLY MODE: Just save as completed (old behavior) ===
        const selectedDateISO = deliveryDate.toISOString();

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            provider_id: selectedProviderId,
            package_id: selectedPackageId,
            package_name: selectedPackage.package_name,
            data_amount: selectedPackage.data_amount,
            selling_price: selectedPackage.selling_price,
            receiver_phone: formattedReceiverPhone,
            sender_phone: formattedSenderPhone || null,
            customer_phone: formattedSenderPhone || formattedReceiverPhone,
            payment_number: 'MANUAL',
            payment_provider_id: paymentProvider.id,
            status: 'completed',
            delivery_status: 'delivered',
            delivered_at: selectedDateISO,
            created_at: selectedDateISO,
            updated_at: selectedDateISO,
            payment_source: 'manual',
            is_manual: true,
            delivery_notes: notes || null,
          })
          .select('id')
          .single();

        if (orderError) throw orderError;

        const { error: deliveryError } = await supabase
          .from('delivery_queue')
          .insert({
            order_id: order.id,
            receiver_phone: formattedReceiverPhone,
            provider_name: normalizeProviderSlug(selectedProvider.provider_name),
            ussd_code: 'MANUAL',
            android_device_id: deviceId,
            sim_slot: simSlot,
            status: 'completed',
            completed_at: selectedDateISO,
            created_at: selectedDateISO,
          });

        if (deliveryError) throw deliveryError;

        toast({
          title: language === 'so' ? 'Dalabka waa la keydiyay' : 'Delivery saved successfully',
          description: `${selectedPackage.package_name} - ${formattedReceiverPhone}`,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding manual delivery:', error);
      toast({
        title: language === 'so' ? 'Khalad ayaa dhacay' : 'Error occurred',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {language === 'so' ? 'Ku Dar Dalab' : 'Add Delivery'}
          </DialogTitle>
          <DialogDescription>
            {`${deviceName} - SIM ${simSlot} (${providerName})`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Auto-Deliver Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              {autoDeliver ? (
                <Zap className="h-4 w-4 text-primary" />
              ) : (
                <PenLine className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {autoDeliver 
                    ? (language === 'so' ? 'Otomaatig u dir' : 'Auto-deliver')
                    : (language === 'so' ? 'Diiwaangeli kaliya' : 'Record only')
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoDeliver 
                    ? (language === 'so' ? 'Android-ku USSD ayuu u diri doonaa' : 'Android will send via USSD')
                    : (language === 'so' ? 'Gacanta ayaa loo diray, keydiye kaliya' : 'Already sent manually, just record it')
                  }
                </p>
              </div>
            </div>
            <Switch checked={autoDeliver} onCheckedChange={setAutoDeliver} />
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Provider' : 'Provider'}</Label>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'so' ? 'Dooro provider' : 'Select provider'} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.provider_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Package Selection */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Package' : 'Package'}</Label>
            <Select 
              value={selectedPackageId} 
              onValueChange={setSelectedPackageId}
              disabled={!selectedProviderId || loadingPackages}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  loadingPackages 
                    ? (language === 'so' ? 'Waa la soo qaadayaa...' : 'Loading...') 
                    : (language === 'so' ? 'Dooro package' : 'Select package')
                } />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} - {pkg.data_amount} (${pkg.selling_price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Receiver Phone */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Qaataha' : 'Receiver Phone'}</Label>
            <Input
              type="tel"
              placeholder="61XXXXXXX"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              maxLength={9}
            />
          </div>

          {/* Sender Phone (Optional) */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Macmiilka (ikhtiyaari)' : 'Customer Phone (optional)'}</Label>
            <Input
              type="tel"
              placeholder="61XXXXXXX"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              maxLength={9}
            />
          </div>

          {/* Delivery Date — only show for record-only mode */}
          {!autoDeliver && (
            <div className="space-y-2">
              <Label>{language === 'so' ? 'Taariikhda Delivery' : 'Delivery Date'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !deliveryDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deliveryDate ? format(deliveryDate, 'PPP') : (language === 'so' ? 'Dooro taariikh' : 'Pick a date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={(date) => date && setDeliveryDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Faahfaahin (ikhtiyaari)' : 'Notes (optional)'}</Label>
            <Textarea
              placeholder={language === 'so' ? 'Faahfaahin dheeraad ah...' : 'Additional notes...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {autoDeliver 
                    ? (language === 'so' ? 'Waa la dirayaa...' : 'Queuing...')
                    : (language === 'so' ? 'Waa la keydiyaa...' : 'Saving...')
                  }
                </>
              ) : (
                <>
                  {autoDeliver ? <Zap className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {autoDeliver 
                    ? (language === 'so' ? 'U Dir' : 'Send')
                    : (language === 'so' ? 'Ku Dar' : 'Add')
                  }
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};