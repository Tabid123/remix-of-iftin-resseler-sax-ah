import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Search, CheckCircle, XCircle, Clock, Copy, Filter, CalendarIcon, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn, formatPrice } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddManualDeliveryDialog } from './AddManualDeliveryDialog';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
  display_order: number;
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

interface OrdersTabProps {
  providers: Provider[];
  deliveryInstructions: DeliveryInstruction[];
}

export const OrdersTab = ({ providers, deliveryInstructions }: OrdersTabProps) => {
  const { language } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("all");

  // USSD Dialog state
  const [showUSSDDialog, setShowUSSDDialog] = useState(false);
  const [generatedUSSDCode, setGeneratedUSSDCode] = useState('');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadOrders();
    
    // Real-time subscription
    const channel = supabase
      .channel('orders-tab-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new as Order;
          setOrders(prev => {
            if (prev.find(o => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Order;
          setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // Load today's orders first for speed
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('orders')
        .select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url')
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (data) {
        setOrders(data as Order[]);
      }
      if (error) console.error('Error loading orders:', error);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllOrders = async () => {
    setLoading(true);
    try {
      const { fetchAllRows } = await import('@/utils/fetchAllRows');
      const allOrders = await fetchAllRows<Order>(() =>
        supabase.from('orders')
          .select('id,customer_phone,sender_phone,package_name,selling_price,status,delivery_status,created_at,updated_at,provider_id,package_id,data_amount,receiver_phone,payment_number,is_manual,payment_provider_id,payment_source,delivered_at,delivery_notes,invoice_url')
          .order('created_at', { ascending: false })
      );
      setOrders(allOrders);
    } catch (err) {
      console.error('Error loading all orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter orders
  useEffect(() => {
    let filtered = orders;
    if (orderFilter !== 'all') {
      if (orderFilter === 'completed') {
        filtered = filtered.filter(o => o.status === 'completed' || o.delivery_status === 'delivered');
      } else if (orderFilter === 'failed') {
        filtered = filtered.filter(o => o.status === 'failed' || o.delivery_status === 'failed');
      } else {
        filtered = filtered.filter(o => o.status === orderFilter);
      }
    }
    if (orderSearch) {
      filtered = filtered.filter(order =>
        order.customer_phone.includes(orderSearch) ||
        order.receiver_phone.includes(orderSearch) ||
        order.package_name.toLowerCase().includes(orderSearch.toLowerCase())
      );
    }
    if (dateFrom) filtered = filtered.filter(order => new Date(order.created_at) >= dateFrom);
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(order => new Date(order.created_at) <= endOfDay);
    }
    if (providerFilter && providerFilter !== "all") {
      filtered = filtered.filter(order => order.provider_id === providerFilter);
    }
    if (deliveryStatusFilter && deliveryStatusFilter !== "all") {
      filtered = filtered.filter(order => order.delivery_status === deliveryStatusFilter);
    }
    setFilteredOrders(filtered);
  }, [orderFilter, orderSearch, orders, dateFrom, dateTo, providerFilter, deliveryStatusFilter]);

  const updateOrderStatus = async (orderId: string, status: 'failed') => {
    const { error } = await supabase
      .from('orders')
      .update({ status, delivery_status: 'failed' })
      .eq('id', orderId);
    if (error) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Dalabka waa la diidday' : 'Order marked as failed' });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, delivery_status: 'failed' } : o));
    }
  };

  const confirmPayment = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({ status: 'payment_confirmed' }).eq('id', orderId);
    if (error) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Lacagta waa la xaqiijiyay' : 'Payment confirmed' });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'payment_confirmed' as const } : o));
    }
  };

  const sendUSSDCode = async (order: Order) => {
    const orderPackage = { category_id: null as string | null }; // simplified
    let instruction = deliveryInstructions.find(d => d.provider_id === order.provider_id && !d.category_id);
    if (!instruction?.code_template) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: language === 'so' ? 'Code template ma jirto' : 'No code template found', variant: 'destructive' });
      return;
    }
    const priceForUSSD = order.selling_price.toString().replace('.', '*');
    let ussdCode = instruction.code_template;
    ussdCode = ussdCode.replace(/{receiver_phone}/g, order.receiver_phone);
    ussdCode = ussdCode.replace(/{package_name}/g, order.package_name);
    ussdCode = ussdCode.replace(/{data_amount}/g, order.data_amount);
    ussdCode = ussdCode.replace(/{customer_phone}/g, order.customer_phone);
    ussdCode = ussdCode.replace(/{sim_password}/g, instruction.sim_password || '');
    ussdCode = ussdCode.replace(/{price}/g, priceForUSSD);
    setGeneratedUSSDCode(ussdCode);
    setCurrentOrder(order);
    setShowUSSDDialog(true);
  };

  const copyUSSDCode = () => {
    navigator.clipboard.writeText(generatedUSSDCode);
    toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Code-ka waa la copy garay' : 'Code copied' });
  };

  const completeOrderAfterUSSD = async () => {
    if (!currentOrder) return;
    const { error } = await supabase.from('orders').update({ status: 'completed', delivery_status: 'completed', delivered_at: new Date().toISOString() }).eq('id', currentOrder.id);
    if (!error) {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Order-ka waa la dhamaystiray' : 'Order completed' });
      setShowUSSDDialog(false);
      setGeneratedUSSDCode('');
      setOrders(prev => prev.map(o => o.id === currentOrder.id ? { ...o, status: 'completed' as const, delivery_status: 'completed', delivered_at: new Date().toISOString() } : o));
      setCurrentOrder(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            💡 {language === 'so' ? 'Sida Sistemku u Shaqeeyo' : 'How the System Works'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p>1️⃣ {language === 'so' ? 'Customer-ku wuxuu doorataa xirmada' : 'Customer selects package'}</p>
            <p>2️⃣ {language === 'so' ? 'Lacagta waxay ku soo diraan mobile money' : 'Payment via mobile money'}</p>
            <p>3️⃣ {language === 'so' ? 'Android-ku wuxuu gaadhsiiyaa USSD code' : 'Android device delivers via USSD'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{language === 'so' ? 'Maamulka Dalabka' : 'Orders Management'}</CardTitle>
            <CardDescription>
              {language === 'so' ? 'Eeg oo maamul dhammaan dalabka' : 'View and manage all orders'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadAllOrders} disabled={loading}>
            {language === 'so' ? 'Soo qaad dhammaan' : 'Load All'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'so' ? 'Raadi lambarka ama package-ka' : 'Search by phone or package'}
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant={orderFilter === 'all' ? 'default' : 'outline'} onClick={() => setOrderFilter('all')} size="sm">
                  {language === 'so' ? 'Dhammaan' : 'All'}
                </Button>
                <Button variant={orderFilter === 'pending' ? 'default' : 'outline'} onClick={() => setOrderFilter('pending')} size="sm">
                  <Clock className="h-4 w-4 mr-1" /> {language === 'so' ? 'Sugitaan' : 'Pending'}
                </Button>
                <Button variant={orderFilter === 'completed' ? 'default' : 'outline'} onClick={() => setOrderFilter('completed')} size="sm">
                  <CheckCircle className="h-4 w-4 mr-1" /> {language === 'so' ? 'Dhacay' : 'Completed'}
                </Button>
                <Button variant={orderFilter === 'failed' ? 'default' : 'outline'} onClick={() => setOrderFilter('failed')} size="sm">
                  <XCircle className="h-4 w-4 mr-1" /> {language === 'so' ? 'Fashilmay' : 'Failed'}
                </Button>
                <Button
                  variant={showAdvancedFilters ? "default" : "outline"}
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  size="sm"
                  className={cn((dateFrom || dateTo || providerFilter !== "all" || deliveryStatusFilter !== "all") && "border-primary")}
                >
                  <Filter className="h-4 w-4 mr-1" /> Filter
                </Button>
              </div>
            </div>

            {showAdvancedFilters && (
              <Card className="bg-muted/50">
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{language === 'so' ? 'Taariikhda Bilowga' : 'Date From'}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateFrom ? format(dateFrom, "PPP") : (language === 'so' ? 'Dooro taariikhda' : 'Pick a date')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{language === 'so' ? 'Taariikhda Dhammaadka' : 'Date To'}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateTo ? format(dateTo, "PPP") : (language === 'so' ? 'Dooro taariikhda' : 'Pick a date')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="pointer-events-auto" disabled={(date) => dateFrom ? date < dateFrom : false} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{language === 'so' ? 'Bixiyaha' : 'Provider'}</Label>
                      <Select value={providerFilter} onValueChange={setProviderFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All'}</SelectItem>
                          {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{language === 'so' ? 'Xaaladda Delivery' : 'Delivery Status'}</Label>
                      <Select value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All'}</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="queued">Queued</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(dateFrom || dateTo || providerFilter !== "all" || deliveryStatusFilter !== "all") && (
                    <div className="flex justify-end pt-2">
                      <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setProviderFilter("all"); setDeliveryStatusFilter("all"); }} className="text-muted-foreground">
                        <X className="h-4 w-4 mr-2" /> {language === 'so' ? 'Tirtir Filters' : 'Clear Filters'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Orders Table */}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'so' ? 'Waqtiga' : 'Date'}</TableHead>
                  <TableHead>{language === 'so' ? 'Macmiilka' : 'Customer'}</TableHead>
                  <TableHead>{language === 'so' ? 'Lambarka Lacagta' : 'Payment From'}</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>{language === 'so' ? 'Qiimaha' : 'Price'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{language === 'so' ? 'Ficilka' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {language === 'so' ? 'Ma jiraan orders' : 'No orders found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.slice(0, 200).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-xs">
                        {new Date(order.created_at).toLocaleString('so-SO', { timeZone: 'Africa/Mogadishu', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{order.customer_phone}</TableCell>
                      <TableCell className="font-mono text-xs">{order.payment_number}</TableCell>
                      <TableCell className="font-mono text-xs">{order.receiver_phone}</TableCell>
                      <TableCell className="text-xs">{order.package_name}</TableCell>
                      <TableCell className="font-medium">${order.selling_price}</TableCell>
                      <TableCell>
                        <Badge variant={
                          order.status === 'completed' ? 'default' :
                          order.status === 'failed' ? 'destructive' :
                          order.status === 'payment_confirmed' ? 'default' : 'secondary'
                        } className={order.status === 'completed' ? 'bg-green-500' : order.status === 'payment_confirmed' ? 'bg-blue-500' : ''}>
                          {order.delivery_status || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {order.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => confirmPayment(order.id)} className="text-xs">✅</Button>
                              <Button size="sm" variant="destructive" onClick={() => updateOrderStatus(order.id, 'failed')} className="text-xs">❌</Button>
                            </>
                          )}
                          {order.status === 'payment_confirmed' && (
                            <Button size="sm" onClick={() => sendUSSDCode(order)} className="text-xs">📞 USSD</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredOrders.length > 200 && (
            <p className="text-sm text-muted-foreground text-center">
              {language === 'so' ? `200/${filteredOrders.length} la tusiyay` : `Showing 200 of ${filteredOrders.length}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* USSD Code Dialog */}
      <Dialog open={showUSSDDialog} onOpenChange={setShowUSSDDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">{language === 'so' ? 'USSD Code Diyaar ah' : 'USSD Code Ready'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {currentOrder && (
              <div className="space-y-2 text-sm border-b pb-4">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span><span className="font-medium">{currentOrder.customer_phone}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Package:</span><span className="font-medium">{currentOrder.package_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Receiver:</span><span className="font-medium">{currentOrder.receiver_phone}</span></div>
              </div>
            )}
            <div className="bg-muted rounded-lg p-6 text-center">
              <p className="text-xs text-muted-foreground mb-2">USSD Code</p>
              <p className="text-2xl md:text-3xl font-bold font-mono tracking-wider break-all">{generatedUSSDCode}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={copyUSSDCode} variant="outline" className="flex-1" size="lg">
              <Copy className="h-4 w-4 mr-2" /> 📋 Copy
            </Button>
            <Button onClick={completeOrderAfterUSSD} className="flex-1" size="lg">
              <CheckCircle className="h-4 w-4 mr-2" /> ✓ {language === 'so' ? 'Dhameey' : 'Complete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
