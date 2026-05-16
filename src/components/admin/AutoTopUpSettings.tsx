import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Power, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';

interface AutoTopUpNumber {
  id: string;
  phone_number: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

interface AutoTopUpOrder {
  id: string;
  sender_phone: string | null;
  receiver_phone: string;
  package_name: string;
  selling_price: number;
  status: string;
  delivery_status: string | null;
  created_at: string;
  topup_number: string; // which auto-topup number received the money
}

// Map provider name from receiver_sim to prefix
const providerPrefixes: Record<string, string[]> = {
  somnet: ['68'],
  hormuud: ['61', '77'],
  somtel: ['62'],
};

const getProviderForNumber = (phone: string): string => {
  const norm = phone.replace(/\D/g, '').replace(/^(\+?252|0)/, '').slice(-9);
  const prefix = norm.substring(0, 2);
  if (prefix === '68') return 'somnet';
  if (prefix === '61' || prefix === '77') return 'hormuud';
  if (prefix === '62') return 'somtel';
  return '';
};

export const AutoTopUpSettings = () => {
  const { language } = useLanguage();
  const [numbers, setNumbers] = useState<AutoTopUpNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [orders, setOrders] = useState<AutoTopUpOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [selectedNumber, setSelectedNumber] = useState<string>('all');

  useEffect(() => {
    loadNumbers();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [selectedDate, numbers]);

  const loadOrders = async () => {
    if (numbers.length === 0) return;
    const startOfDay = `${selectedDate}T00:00:00.000Z`;
    const endOfDay = `${selectedDate}T23:59:59.999Z`;

    // Get payment_receipts with auto_topup matching strategy
    const { data: receipts } = await supabase
      .from('payment_receipts')
      .select('matched_order_id, receiver_sim')
      .eq('matching_strategy', 'auto_topup')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    if (!receipts || receipts.length === 0) {
      setOrders([]);
      return;
    }

    // Map order_id → which auto-topup number it belongs to
    const orderToTopup = new Map<string, string>();
    for (const r of receipts) {
      if (!r.matched_order_id) continue;
      const provider = (r.receiver_sim || '').toLowerCase();
      const prefixes = providerPrefixes[provider] || [];
      const matchedNum = numbers.find(n => {
        const norm = n.phone_number.replace(/\D/g, '').replace(/^(\+?252|0)/, '').slice(-9);
        return prefixes.some(p => norm.startsWith(p));
      });
      orderToTopup.set(r.matched_order_id, matchedNum?.phone_number || provider);
    }

    const orderIds = receipts.map(r => r.matched_order_id).filter(Boolean) as string[];
    if (orderIds.length === 0) { setOrders([]); return; }

    const { data: orderData } = await supabase
      .from('orders')
      .select('id, sender_phone, receiver_phone, package_name, selling_price, status, delivery_status, created_at')
      .in('id', orderIds)
      .order('created_at', { ascending: false });

    setOrders((orderData || []).map(o => ({
      ...o,
      topup_number: orderToTopup.get(o.id) || '-',
    })));
  };

  const loadNumbers = async () => {
    const { data, error } = await supabase
      .from('auto_topup_numbers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNumbers(data || []);
    }
    setLoading(false);
  };

  const addNumber = async () => {
    if (!newPhone.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('auto_topup_numbers').insert({
      phone_number: newPhone.trim(),
      label: newLabel.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Lambarka waa lagu daray' : 'Number added' });
      setNewPhone('');
      setNewLabel('');
      loadNumbers();
      loadOrders();
    }
    setAdding(false);
  };

  const normPhone = (p: string) => p.replace(/\D/g, '').replace(/^(\+?252|0)/, '').slice(-9);

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase.from('auto_topup_numbers').update({ is_active: !currentActive }).eq('id', id);
    if (!error) loadNumbers();
  };

  const deleteNumber = async (id: string) => {
    const { error } = await supabase.from('auto_topup_numbers').delete().eq('id', id);
    if (!error) loadNumbers();
  };

  const filteredOrders = selectedNumber === 'all'
    ? orders
    : orders.filter(o => o.topup_number === selectedNumber);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Numbers Management Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            {language === 'so' ? 'Auto Top-Up Lambarada' : 'Auto Top-Up Numbers'}
          </CardTitle>
          <CardDescription>
            {language === 'so'
              ? 'Marka macaamiil lacag u soo diro lambarahan, system-ku otomaatig ayuu xirmad u shubayaa sender-ka. Lambarka la damiyay ama la saaray ma shaqeynayo.'
              : 'When a customer sends money to these numbers, the system auto-delivers. Disabled or deleted numbers will not work.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label>{language === 'so' ? 'Lambarka' : 'Phone Number'}</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="617195659"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label>{language === 'so' ? 'Sharax' : 'Label'}</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Auto Reload Line"
              />
            </div>
            <Button onClick={addNumber} disabled={adding || !newPhone.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {language === 'so' ? 'Ku dar' : 'Add'}
            </Button>
          </div>

          {/* Numbers Table */}
          {numbers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {language === 'so' ? 'Wali lambar ma jiro' : 'No auto top-up numbers yet'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'so' ? 'Lambarka' : 'Phone'}</TableHead>
                  <TableHead>{language === 'so' ? 'Sharax' : 'Label'}</TableHead>
                  <TableHead>{language === 'so' ? 'Xaalad' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((num) => (
                  <TableRow key={num.id}>
                    <TableCell className="font-mono">{num.phone_number}</TableCell>
                    <TableCell>{num.label || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={num.is_active ? 'default' : 'secondary'}>
                        {num.is_active ? (language === 'so' ? 'Firfircoon' : 'Active') : (language === 'so' ? 'Daminsan' : 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => toggleActive(num.id, num.is_active)}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteNumber(num.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Orders Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {language === 'so' ? 'Auto Top-Up Dalabyadii' : 'Auto Top-Up Orders'}
          </CardTitle>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto"
            />
            <Select value={selectedNumber} onValueChange={setSelectedNumber}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={language === 'so' ? 'Dhammaan' : 'All numbers'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All numbers'}</SelectItem>
                {numbers.map((n) => (
                  <SelectItem key={n.id} value={n.phone_number}>
                    {n.phone_number} {n.label ? `(${n.label})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <p className="text-muted-foreground text-center py-4 text-sm">
              {language === 'so' ? 'Dalab ma jiro' : 'No orders found'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {filteredOrders.length} {language === 'so' ? 'dalab' : 'orders'}
              </p>
              {filteredOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg p-3 gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-mono font-medium">{o.sender_phone || o.receiver_phone}</div>
                    <div className="font-medium text-muted-foreground">{o.package_name}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-semibold">${o.selling_price}</span>
                    <Badge variant={o.delivery_status === 'delivered' ? 'default' : 'secondary'} className="text-[10px]">
                      {o.delivery_status || o.status}
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">{format(new Date(o.created_at), 'HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
