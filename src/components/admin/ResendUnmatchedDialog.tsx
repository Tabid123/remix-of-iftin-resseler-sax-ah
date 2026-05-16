import React, { useState, useEffect, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send, AlertTriangle } from 'lucide-react';

interface Provider { id: string; provider_name: string; }
interface Category { id: string; category_name: string; provider_id: string | null; }
interface Package {
  id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  ussd_code: string | null;
  category_id: string | null;
  provider_id: string;
}

interface ResendUnmatchedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any | null;
  intentReceiverPhone?: string;
  onSuccess: () => void;
}

const formatAmountForUssd = (amount: number) => {
  if (Number.isInteger(amount)) return amount.toString();
  const formatted = Number(amount).toFixed(2);
  if (amount < 1) return formatted.replace('.', '');
  return formatted.replace('.', '*');
};

const normalizePhoneForUssd = (phone: string): string => {
  let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
  if (p.startsWith('252')) p = p.substring(3);
  return p.slice(-9);
};

const normalizeProviderSlug = (name: string) => {
  const lower = (name || '').toLowerCase();
  if (lower.includes('hormuud')) return 'hormuud';
  if (lower.includes('somnet')) return 'somnet';
  if (lower.includes('somtel')) return 'somtel';
  if (lower.includes('amtel')) return 'amtel';
  if (lower.includes('somlink')) return 'somlink';
  return lower.split(' ')[0];
};

export const ResendUnmatchedDialog: React.FC<ResendUnmatchedDialogProps> = ({
  open,
  onOpenChange,
  payment,
  intentReceiverPhone,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);

  const [providerId, setProviderId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('__all__');
  const [packageId, setPackageId] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  // Initial fetch
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [provRes, catRes, pkgRes] = await Promise.all([
        supabase.from('providers_config').select('id, provider_name').eq('is_active', true).order('display_order'),
        supabase.from('package_categories').select('id, category_name, provider_id').eq('is_active', true).order('display_order'),
        supabase.from('data_packages_config').select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id, provider_id').eq('is_active', true).order('selling_price'),
      ]);
      setProviders(provRes.data || []);
      setCategories(catRes.data || []);
      setPackages((pkgRes.data || []) as Package[]);
    })();
  }, [open]);

  // Pre-fill receiver phone
  useEffect(() => {
    if (open) {
      setReceiverPhone(intentReceiverPhone || payment?.sender_phone || '');
      setCategoryId('__all__');
      setPackageId('');
    }
  }, [open, intentReceiverPhone, payment]);

  const simProviderSlug = useMemo(
    () => normalizeProviderSlug(payment?.receiver_sim || ''),
    [payment]
  );
  const selectedProviderSlug = useMemo(() => {
    const p = providers.find(pr => pr.id === providerId);
    return p ? normalizeProviderSlug(p.provider_name) : '';
  }, [providers, providerId]);
  const providerMismatch = !!(providerId && simProviderSlug && selectedProviderSlug && simProviderSlug !== selectedProviderSlug);

  const filteredCategories = useMemo(
    () => categories.filter(c => !c.provider_id || c.provider_id === providerId),
    [categories, providerId]
  );

  const filteredPackages = useMemo(() => {
    return packages.filter(p => {
      if (p.provider_id !== providerId) return false;
      if (categoryId && categoryId !== '__all__' && p.category_id !== categoryId) return false;
      return true;
    });
  }, [packages, providerId, categoryId]);

  // Reset deeper selections when parent changes
  useEffect(() => { setCategoryId('__all__'); setPackageId(''); }, [providerId]);
  useEffect(() => { setPackageId(''); }, [categoryId]);

  const buildUssdCode = async (pkg: Package, providerName: string, formattedReceiverPhone: string): Promise<string | null> => {
    let instruction: { code_template: string; sim_password: string | null } | null = null;

    const { data: pkgInstr } = await supabase
      .from('delivery_instructions')
      .select('code_template, sim_password')
      .eq('provider_id', pkg.provider_id)
      .eq('package_id', pkg.id)
      .maybeSingle();
    if (pkgInstr?.code_template) instruction = pkgInstr;

    if (!instruction && pkg.category_id) {
      const { data: catInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', pkg.provider_id)
        .eq('category_id', pkg.category_id)
        .is('package_id', null)
        .maybeSingle();
      if (catInstr?.code_template) instruction = catInstr;
    }

    if (!instruction) {
      const { data: provInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', pkg.provider_id)
        .is('category_id', null)
        .is('package_id', null)
        .maybeSingle();
      if (provInstr?.code_template) instruction = provInstr;
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

  const validateAndOpenConfirm = () => {
    if (!payment) return;
    if (!providerId || !packageId) {
      toast({ title: 'Fadlan dooro provider iyo package', variant: 'destructive' });
      return;
    }
    if (!receiverPhone || receiverPhone.replace(/\D/g, '').length < 9) {
      toast({ title: 'Numberka qaataha waa khalad', variant: 'destructive' });
      return;
    }
    setConfirmOpen(true);
  };

  const handleResend = async () => {
    if (!payment) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      const pkg = packages.find(p => p.id === packageId);
      const provider = providers.find(p => p.id === providerId);
      if (!pkg || !provider) throw new Error('Package or provider not found');

      const { data: paymentProvider } = await supabase
        .from('payment_providers_config')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!paymentProvider) throw new Error('No payment provider found');

      let formattedReceiverPhone = receiverPhone.replace(/\D/g, '');
      if (!formattedReceiverPhone.startsWith('252')) formattedReceiverPhone = '252' + formattedReceiverPhone;

      const formattedSenderPhone = (payment.sender_phone || '').replace(/\D/g, '');

      const providerSlug = normalizeProviderSlug(provider.provider_name);

      // Linked delivery rules
      const { data: deliveryRules } = await supabase
        .from('package_delivery_rules')
        .select('*')
        .eq('source_package_id', pkg.id)
        .eq('is_active', true)
        .order('execution_order');

      interface DeliveryTarget { pkg: Package; count: number; }
      const deliveryTargets: DeliveryTarget[] = [];

      if (deliveryRules && deliveryRules.length > 0) {
        const targetIds = deliveryRules.map(r => r.target_package_id);
        const { data: targetPkgs } = await supabase
          .from('data_packages_config')
          .select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id, provider_id')
          .in('id', targetIds);
        for (const rule of deliveryRules) {
          const tp = (targetPkgs || []).find(p => p.id === rule.target_package_id) as Package | undefined;
          if (tp) deliveryTargets.push({ pkg: tp, count: rule.delivery_count });
        }
      } else {
        deliveryTargets.push({ pkg, count: 1 });
      }

      const queueEntries: { ussdCode: string; pkg: Package }[] = [];
      for (const t of deliveryTargets) {
        const ussd = await buildUssdCode(t.pkg, provider.provider_name, formattedReceiverPhone);
        if (!ussd) {
          toast({ title: 'USSD code la heli waayay', description: t.pkg.package_name, variant: 'destructive' });
          setLoading(false);
          return;
        }
        for (let i = 0; i < t.count; i++) queueEntries.push({ ussdCode: ussd, pkg: t.pkg });
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          provider_id: providerId,
          package_id: pkg.id,
          package_name: pkg.package_name,
          data_amount: pkg.data_amount,
          selling_price: pkg.selling_price,
          receiver_phone: formattedReceiverPhone,
          sender_phone: formattedSenderPhone || null,
          customer_phone: formattedSenderPhone || formattedReceiverPhone,
          payment_number: payment.receiver_sim || 'MANUAL',
          payment_provider_id: paymentProvider.id,
          status: 'completed',
          delivery_status: 'pending',
          payment_source: 'manual_resend',
          is_manual: true,
          delivery_notes: `Resend ka unmatched payment (${payment.id}) - $${payment.amount}`,
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      // Queue rows
      const queueRows = queueEntries.map(e => ({
        order_id: order.id,
        receiver_phone: formattedReceiverPhone,
        provider_name: providerSlug,
        ussd_code: e.ussdCode,
        package_code: e.pkg.ussd_code || null,
        status: 'pending' as const,
      }));
      const { error: qErr } = await supabase.from('delivery_queue').insert(queueRows);
      if (qErr) throw qErr;

      // Mark payment as matched
      await supabase
        .from('payment_receipts')
        .update({
          status: 'matched',
          matched_order_id: order.id,
          matching_strategy: 'manual_resend',
          processed_at: new Date().toISOString(),
          admin_notes: `${payment.admin_notes || ''}\n[Manual resend] → order ${order.id}`.trim(),
        })
        .eq('id', payment.id);

      toast({
        title: '✅ Dib u dirka waa la queue gareeyay',
        description: `${pkg.package_name} → ${formattedReceiverPhone}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Resend error:', err);
      toast({ title: 'Khalad', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Dib u Dir Dalabka (Unmatched)
          </DialogTitle>
          <DialogDescription>
            Sender: {payment.sender_phone} • Lacag: ${payment.amount} • SIM: {payment.receiver_sim}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider / Shirkadda</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Dooro provider" /></SelectTrigger>
              <SelectContent>
                {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {providerMismatch && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Digniin: SIM-ka lacagta lagu helay waa <strong>{payment?.receiver_sim}</strong>, laakiin shirkadda aad doortay waa <strong>{providers.find(p => p.id === providerId)?.provider_name}</strong>. Hubi inay sax tahay.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Category (ikhtiyaari)</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={!providerId}>
              <SelectTrigger><SelectValue placeholder="Dhammaan categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Dhammaan</SelectItem>
                {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Package</Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!providerId}>
              <SelectTrigger><SelectValue placeholder="Dooro package" /></SelectTrigger>
              <SelectContent>
                {filteredPackages.map(pkg => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} - {pkg.data_amount} (${pkg.selling_price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Numberka Qaataha</Label>
            <Input
              type="tel"
              placeholder="61XXXXXXX"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Ka noqo
            </Button>
            <Button type="button" disabled={loading} onClick={validateAndOpenConfirm} className="flex-1">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Waa la dirayaa...</> : <><Send className="mr-2 h-4 w-4" />Dib u Dir</>}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Xaqiiji Dib u Dirka
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Ma hubtaa inaad rabto inaad dib u dirto dalabkan?</p>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                  <div><strong>Package:</strong> {packages.find(p => p.id === packageId)?.package_name} ({packages.find(p => p.id === packageId)?.data_amount})</div>
                  <div><strong>Provider:</strong> {providers.find(p => p.id === providerId)?.provider_name}</div>
                  <div><strong>Qaataha:</strong> {receiverPhone}</div>
                  <div><strong>Lacagta:</strong> ${payment?.amount}</div>
                </div>
                {providerMismatch && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold">Digniin: SIM iyo Shirkad isma waafaqaan</div>
                        <div className="text-xs mt-1">
                          Lacagta waxaa lagu helay SIM-ka <strong>{payment?.receiver_sim}</strong>, laakiin waxaad u dirayssaa shirkadda <strong>{providers.find(p => p.id === providerId)?.provider_name}</strong>. Fadlan hubi.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-destructive font-medium">⚠️ Tallaabadan ma laga noqon karo marka la dirayo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Maya, ka noqo</AlertDialogCancel>
            <AlertDialogAction onClick={handleResend}>Haa, dir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
