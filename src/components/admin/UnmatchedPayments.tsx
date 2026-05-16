import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, UserX, Package, HelpCircle, Send, UserPlus } from 'lucide-react';
import { ResendUnmatchedDialog } from './ResendUnmatchedDialog';
import { RegisterOfflineDialog } from './RegisterOfflineDialog';

/**
 * Normalize Somali phone to canonical 9-digit local format
 */
function normalizeSomaliPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) {
    digits = digits.substring(3);
  }
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.substring(1);
  }
  return digits.slice(-9);
}

/**
 * Analyze why a payment was unmatched based on admin_notes from edge function
 */
function getUnmatchedReason(payment: any): { icon: React.ReactNode; title: string; detail: string } {
  const notes = (payment.admin_notes || '').toLowerCase();
  const strategy = (payment.matching_strategy || '').toLowerCase();

  // NEW: Amount mismatch on a confirmed online intent
  if (strategy === 'amount_mismatch' || notes.includes('pending online payment found but amount mismatch')) {
    const expectedMatch = (payment.admin_notes || '').match(/Expected:\s*\$([\d.]+)/i);
    const receivedMatch = (payment.admin_notes || '').match(/Received:\s*\$([\d.]+)/i);
    const expected = expectedMatch?.[1] ?? '?';
    const received = receivedMatch?.[1] ?? payment.amount;
    return {
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />,
      title: 'Lacagtu kama ekayn dalabkii la rabay',
      detail: `Macmiilku wuxuu doonayey inuu bixiyo $${expected}, balse wuxuu diray $${received}. Online intent waa la helay laakiin lacagtu way kala duwantahay.`
    };
  }

  // NEW: Late/duplicate SMS for an already matched online intent
  if (strategy === 'late_duplicate_online' || notes.includes('recent online payment already matched')) {
    return {
      icon: <HelpCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />,
      title: 'SMS dib u dhacay (waa la matched gareeyay)',
      detail: 'Online payment-kii hore ayaa horey loo matched gareeyay. SMS-kan waxa uu yahay nuqul dib u soo gaadhay.'
    };
  }

  // NEW: No online intent AND no offline registration
  if (strategy === 'no_intent_no_registration' || notes.includes('no online intent and no offline registration')) {
    return {
      icon: <UserX className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      title: 'Lambarkaan system-ka kuma jiro',
      detail: `Lambarka ${payment.sender_phone} ma haystaan online intent ama offline registration. Macmiilku wuu u baahan yahay inuu marka hore isdiiwaangeliyo.`
    };
  }

  if (notes.includes('no offline registration')) {
    return {
      icon: <UserX className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      title: 'Lambarkaan system-ka kuma jiro',
      detail: `Lambarka ${payment.sender_phone} ma jiro system-ka. Macmiilku wuu u baahan yahay inuu marka hore isdiiwaangeliyo.`
    };
  }

  if (notes.includes('no package found')) {
    const crossMatch = notes.match(/waa xirmo (.+?) ah \((.+?)\)/);
    if (crossMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: 'Provider-ka qaldan ayuu ku isdiiwaangeliyay',
        detail: `$${payment.amount} - waa xirmo ${crossMatch[1]} ah (${crossMatch[2]}), laakiin macmiilku wuxuu isdiiwaangeliyay provider kale.`
      };
    }
    return {
      icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
      title: 'Ma jiro xirmo qiimahaan la iibiyo',
      detail: `$${payment.amount} - ma jiro xirmo qiimahaan ah oo active ah.`
    };
  }
  
  if (notes.includes('amount mismatch')) {
    return {
      icon: <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />,
      title: 'Lacagtu kama ekayn dalabka',
      detail: `$${payment.amount} lama helin dalab lacagtiisu la mid tahay.`
    };
  }
  
  return {
    icon: <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />,
    title: 'Sabab la garaneyn',
    detail: payment.admin_notes || `Dalab la mid ah lama helin lambarka ${payment.sender_phone}`
  };
}

interface IntentData {
  receiver_phone: string;
  expected_amount: number;
  package_name?: string;
  provider_name?: string;
}

const UnmatchedPayments = () => {
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [intentMap, setIntentMap] = useState<Record<string, IntentData>>({});
  const [resendPayment, setResendPayment] = useState<any | null>(null);
  const [registerPayment, setRegisterPayment] = useState<any | null>(null);

  // Fetch intent data from pending_online_payments for all unmatched sender phones
  const fetchIntentData = async (payments: any[]) => {
    if (!payments.length) return;
    
    const senderPhones = [...new Set(payments.map(p => normalizeSomaliPhone(p.sender_phone)))];
    
    try {
      const { data: pendingData } = await supabase
        .from('pending_online_payments')
        .select('sender_phone, receiver_phone, expected_amount, package_id, provider_id')
        .order('created_at', { ascending: false });

      if (!pendingData?.length) return;

      // Also fetch package names and provider names
      const packageIds = [...new Set(pendingData.filter(p => p.package_id).map(p => p.package_id!))];
      const providerIds = [...new Set(pendingData.filter(p => p.provider_id).map(p => p.provider_id!))];

      const [pkgRes, provRes] = await Promise.all([
        packageIds.length > 0
          ? supabase.from('data_packages_config').select('id, package_name').in('id', packageIds)
          : Promise.resolve({ data: [] }),
        providerIds.length > 0
          ? supabase.from('providers_config').select('id, provider_name').in('id', providerIds)
          : Promise.resolve({ data: [] }),
      ]);

      const pkgMap: Record<string, string> = {};
      (pkgRes.data || []).forEach((p: any) => { pkgMap[p.id] = p.package_name; });
      const provMap: Record<string, string> = {};
      (provRes.data || []).forEach((p: any) => { provMap[p.id] = p.provider_name; });

      const newIntentMap: Record<string, IntentData> = {};
      for (const phone of senderPhones) {
        // Find most recent pending record for this sender
        const match = pendingData.find(p => {
          const normalized = normalizeSomaliPhone(p.sender_phone || '');
          return normalized === phone;
        });
        if (match) {
          newIntentMap[phone] = {
            receiver_phone: match.receiver_phone,
            expected_amount: match.expected_amount,
            package_name: match.package_id ? pkgMap[match.package_id] : undefined,
            provider_name: match.provider_id ? provMap[match.provider_id] : undefined,
          };
        }
      }
      setIntentMap(newIntentMap);
    } catch (err) {
      console.error('Error fetching intent data:', err);
    }
  };

  useEffect(() => {
    const fetchUnmatched = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('status', 'unmatched')
          .order('created_at', { ascending: false });

        if (error) throw error;
        const payments = data || [];
        setUnmatchedPayments(payments);
        await fetchIntentData(payments);
      } catch (error) {
        console.error('Error fetching unmatched payments:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnmatched();

    const channel = supabase
      .channel('unmatched-payments-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_receipts' },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow.status === 'unmatched') {
            setUnmatchedPayments(prev => {
              const updated = [newRow, ...prev];
              fetchIntentData(updated);
              return updated;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payment_receipts' },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'unmatched') {
            setUnmatchedPayments(prev => {
              const exists = prev.find(p => p.id === updated.id);
              if (exists) return prev.map(p => p.id === updated.id ? updated : p);
              return [updated, ...prev];
            });
          } else {
            setUnmatchedPayments(prev => prev.filter(p => p.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>⚠️ Unmatched Payments ({unmatchedPayments?.length || 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {unmatchedPayments && unmatchedPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sender Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Sababta (Reason)</TableHead>
                  <TableHead>Xirmada la rabay</TableHead>
                  <TableHead>Lambarka loo rabay</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedPayments.map((payment) => {
                  const reason = getUnmatchedReason(payment);
                  const normalizedSender = normalizeSomaliPhone(payment.sender_phone);
                  const intent = intentMap[normalizedSender];
                  
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono">
                        {payment.sender_phone}
                      </TableCell>
                      <TableCell className="font-semibold">${payment.amount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{payment.receiver_sim}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2 max-w-xs">
                          {reason.icon}
                          <div>
                            <p className="text-sm font-medium">{reason.title}</p>
                            <p className="text-xs text-muted-foreground">{reason.detail}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {intent ? (
                          <div className="text-sm">
                            <p className="font-medium">{intent.package_name || '—'}</p>
                            {intent.provider_name && (
                              <p className="text-xs text-muted-foreground">{intent.provider_name}</p>
                            )}
                            <p className="text-xs text-muted-foreground">${intent.expected_amount}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {intent?.receiver_phone || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(payment.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Button size="sm" onClick={() => setResendPayment(payment)}>
                            <Send className="h-3 w-3 mr-1" />
                            Dib u Dir
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRegisterPayment(payment)}>
                            <UserPlus className="h-3 w-3 mr-1" />
                            Diiwaangeli
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>✅ No unmatched payments</p>
          </div>
        )}
      </CardContent>
      <ResendUnmatchedDialog
        open={!!resendPayment}
        onOpenChange={(o) => { if (!o) setResendPayment(null); }}
        payment={resendPayment}
        intentReceiverPhone={resendPayment ? intentMap[normalizeSomaliPhone(resendPayment.sender_phone)]?.receiver_phone : undefined}
        onSuccess={() => setResendPayment(null)}
      />
      <RegisterOfflineDialog
        open={!!registerPayment}
        onOpenChange={(o) => { if (!o) setRegisterPayment(null); }}
        senderPhone={registerPayment?.sender_phone || ''}
        defaultReceiverPhone={registerPayment ? intentMap[normalizeSomaliPhone(registerPayment.sender_phone)]?.receiver_phone : undefined}
        onSuccess={() => setRegisterPayment(null)}
      />
    </Card>
  );
};

export default UnmatchedPayments;
