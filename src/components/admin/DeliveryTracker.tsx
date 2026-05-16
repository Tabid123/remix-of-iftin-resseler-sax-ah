import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, RefreshCw, Truck, CheckCircle2, XCircle, Clock, Phone, Zap, Radio, CheckCheck, Ban, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, subDays, startOfDay, endOfDay } from 'date-fns';

interface DeliveryItem {
  id: string;
  order_id: string;
  provider_name: string;
  receiver_phone: string;
  ussd_code: string;
  package_code: string | null;
  status: string | null;
  attempts: number | null;
  error_message: string | null;
  provider_response: string | null;
  created_at: string | null;
  last_attempt_at: string | null;
  completed_at: string | null;
  android_device_id: string | null;
  flow_progress: Array<{
    step: number;
    total: number;
    keywords?: string[];
    response?: string;
    dialog?: string;
    is_pin?: boolean;
    ts?: number;
  }> | any;
  order?: {
    package_name: string;
    data_amount: string;
    customer_phone: string;
    delivery_notes: string | null;
    delivery_status: string | null;
  };
}

export function DeliveryTracker() {
  const { language } = useLanguage();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [cancelReason, setCancelReason] = useState('');
  const [lastRecoveryAt, setLastRecoveryAt] = useState<Date | null>(null);
  const [nextRecoveryAt, setNextRecoveryAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState<Date>(new Date());

  const loadDeliveries = async () => {
    try {
      // Calculate date range
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;
      const now = new Date();

      switch (dateFilter) {
        case 'today':
          dateFrom = startOfDay(now);
          dateTo = endOfDay(now);
          break;
        case 'yesterday':
          dateFrom = startOfDay(subDays(now, 1));
          dateTo = endOfDay(subDays(now, 1));
          break;
        case '7days':
          dateFrom = startOfDay(subDays(now, 7));
          dateTo = endOfDay(now);
          break;
        case '30days':
          dateFrom = startOfDay(subDays(now, 30));
          dateTo = endOfDay(now);
          break;
        case 'all':
          dateFrom = null;
          dateTo = null;
          break;
        default:
          dateFrom = startOfDay(now);
          dateTo = endOfDay(now);
      }

      let query = supabase
        .from('delivery_queue')
        .select(`
          *,
          order:order_id (
            package_name,
            data_amount,
            customer_phone,
            delivery_notes,
            delivery_status
          )
        `)
        .order('created_at', { ascending: false });

      // Apply date filter
      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      const { data, error } = await query.limit(2000);

      if (error) throw error;
      setDeliveries(data as DeliveryItem[]);
    } catch (error) {
      console.error('Error loading deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, [dateFilter]);

  // Auto-recovery: silently release stuck deliveries every 60s so admin never has to do it manually.
  useEffect(() => {
    const RECOVERY_INTERVAL_MS = 60_000;
    const runRecovery = async () => {
      await handleForceReleaseAll(true);
      const now = new Date();
      setLastRecoveryAt(now);
      setNextRecoveryAt(new Date(now.getTime() + RECOVERY_INTERVAL_MS));
    };
    runRecovery();
    const interval = setInterval(runRecovery, RECOVERY_INTERVAL_MS);
    const tick = setInterval(() => setNowTick(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time subscription - single row fetch, no full reload
  useEffect(() => {
    if (!liveUpdates) return;

    const channel = supabase
      .channel('delivery-queue-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_queue'
        },
        async (payload) => {
          const newId = payload.new?.id;
          if (!newId) return;
          const { data } = await supabase
            .from('delivery_queue')
            .select(`
              *,
              order:order_id (
                package_name,
                data_amount,
                customer_phone,
                delivery_notes,
                delivery_status
              )
            `)
            .eq('id', newId)
            .single();
          if (data) {
            setDeliveries(prev => [data as DeliveryItem, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_queue'
        },
        async (payload) => {
          const updatedId = payload.new?.id;
          if (!updatedId) return;
          const { data } = await supabase
            .from('delivery_queue')
            .select(`
              *,
              order:order_id (
                package_name,
                data_amount,
                customer_phone,
                delivery_notes,
                delivery_status
              )
            `)
            .eq('id', updatedId)
            .single();
          if (data) {
            setDeliveries(prev => prev.map(d => d.id === updatedId ? (data as DeliveryItem) : d));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveUpdates]);

  const getStatusInfo = (status: string | null) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Delivered' };
      case 'processing':
        return { icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Processing' };
      case 'failed':
        return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' };
      case 'cancelled':
        return { icon: Ban, color: 'text-red-600', bg: 'bg-red-600/10', label: language === 'so' ? 'La damiyay' : 'Cancelled' };
      default:
        return { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Pending' };
    }
  };

  const getTimelineSteps = (delivery: DeliveryItem) => {
    const steps = [
      { label: 'Queued', completed: true, time: delivery.created_at },
      { label: 'Processing', completed: delivery.status === 'processing' || delivery.status === 'completed' || delivery.status === 'failed', time: delivery.last_attempt_at },
      { label: 'USSD Sent', completed: delivery.status === 'completed' || (delivery.attempts && delivery.attempts > 0), time: null },
      { label: 'Delivered', completed: delivery.status === 'completed', time: delivery.completed_at }
    ];
    return steps;
  };

  // Check if delivery needs manual verification (USSD sent but delivery failed/timeout)
  const needsManualVerify = (delivery: DeliveryItem): boolean => {
    const ussdWasSent = delivery.attempts && delivery.attempts > 0;
    const deliveryFailed = delivery.status === 'failed' || delivery.status === 'timeout';
    return ussdWasSent && deliveryFailed;
  };

  // Bulk recovery: invoke the auto_recover_stuck_deliveries RPC silently (no UI).
  const handleForceReleaseAll = async (silent = false) => {
    try {
      const { data, error } = await supabase.rpc('auto_recover_stuck_deliveries' as any);
      if (error) throw error;
      if (!silent) {
        const result = (data || {}) as { queue_reset?: number; orders_reset_to_queued?: number; orders_marked_failed?: number };
        toast({
          title: language === 'so' ? 'Recovery dhammaystiran' : 'Recovery complete',
          description: language === 'so'
            ? `Queue: ${result.queue_reset || 0} • Orders queued: ${result.orders_reset_to_queued || 0} • Failed: ${result.orders_marked_failed || 0}`
            : `Queue reset: ${result.queue_reset || 0} • Orders requeued: ${result.orders_reset_to_queued || 0} • Marked failed: ${result.orders_marked_failed || 0}`,
        });
        loadDeliveries();
      }
    } catch (err: any) {
      if (!silent) {
        toast({
          title: language === 'so' ? 'Khalad' : 'Error',
          description: err?.message || 'Failed to run recovery',
          variant: 'destructive',
        });
      }
    }
  };

  const getQueueResult = (delivery: DeliveryItem): string | null => {
    if (delivery.provider_response) return delivery.provider_response;
    if (delivery.status === 'cancelled') return delivery.error_message;
    return null;
  };

  // Manual verify handler
  const handleManualVerify = async (orderId: string, queueId: string) => {
    try {
      // Update order delivery_status to delivered
      await supabase
        .from('orders')
        .update({ 
          delivery_status: 'delivered',
          delivery_notes: 'Manually verified by admin',
          delivered_at: new Date().toISOString()
        })
        .eq('id', orderId);

      // Update delivery queue status to completed
      await supabase
        .from('delivery_queue')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', queueId);

      toast({
        title: language === 'so' ? 'La xaqiijiyay!' : 'Verified!',
        description: language === 'so' ? 'Order-ku waa la soo celin' : 'Order marked as delivered',
      });
      
      loadDeliveries();
    } catch (error) {
      console.error('Manual verify error:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleCancelOrder = async (orderId: string, queueId: string, reason: string) => {
    try {
      const note = reason.trim() ? `Cancelled: ${reason.trim()}` : 'Cancelled by admin';
      await supabase
        .from('orders')
        .update({ 
          delivery_status: 'cancelled',
          delivery_notes: note
        })
        .eq('id', orderId);

      await supabase
        .from('delivery_queue')
        .update({ 
          status: 'cancelled',
          error_message: note
        })
        .eq('id', queueId);

      toast({
        title: language === 'so' ? 'La damiyay!' : 'Cancelled!',
        description: language === 'so' ? 'Order-ka waa la damiyay' : 'Order has been cancelled',
      });
      
      setCancelReason('');
      loadDeliveries();
    } catch (error) {
      console.error('Cancel order error:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleRestoreOrder = async (orderId: string, queueId: string) => {
    try {
      await supabase
        .from('orders')
        .update({ 
          delivery_status: 'delivered',
          delivery_notes: 'Restored by admin'
        })
        .eq('id', orderId);

      await supabase
        .from('delivery_queue')
        .update({ 
          status: 'completed',
          error_message: null
        })
        .eq('id', queueId);

      toast({
        title: language === 'so' ? 'Dib loo soo celiyay!' : 'Restored!',
        description: language === 'so' ? 'Order-ka dib ayaa loo soo celiyay' : 'Order has been restored',
      });
      
      loadDeliveries();
    } catch (error) {
      console.error('Restore order error:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        variant: 'destructive',
      });
    }
  };

  // Helper: check if delivery is auto-retrying
  const isAutoRetrying = (delivery: DeliveryItem): boolean => {
    return !!delivery.error_message && delivery.error_message.includes('Auto-retry') && delivery.status === 'pending';
  };

  const getRetryInfo = (delivery: DeliveryItem): string | null => {
    if (!delivery.error_message) return null;
    const match = delivery.error_message.match(/Auto-retry (\d+\/\d+)/);
    return match ? match[1] : null;
  };

  const cancelledCount = deliveries.filter(d => d.status === 'cancelled').length;
  const activeDel = deliveries.filter(d => d.status !== 'cancelled');
  const stats = {
    total: activeDel.length,
    completed: activeDel.filter(d => d.status === 'completed').length,
    pending: activeDel.filter(d => d.status === 'pending').length,
    processing: activeDel.filter(d => d.status === 'processing').length,
    failed: activeDel.filter(d => d.status === 'failed').length,
    cancelled: cancelledCount
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {language === 'so' ? 'E-Voucher Delivery Tracking' : 'E-Voucher Delivery Tracking'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {language === 'so' ? 'Real-time xirmadaha la diro' : 'Real-time package delivery status'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={language === 'so' ? 'Taariikhda' : 'Date'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhamaan' : 'All'}</SelectItem>
              <SelectItem value="today">{language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
              <SelectItem value="yesterday">{language === 'so' ? 'Shalay' : 'Yesterday'}</SelectItem>
              <SelectItem value="7days">{language === 'so' ? '7 Maalmood' : '7 Days'}</SelectItem>
              <SelectItem value="30days">{language === 'so' ? '30 Maalmood' : '30 Days'}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={liveUpdates ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLiveUpdates(!liveUpdates)}
            className="gap-2"
          >
            <Radio className={`h-4 w-4 ${liveUpdates ? 'animate-pulse' : ''}`} />
            {liveUpdates ? 'Live' : 'Paused'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadDeliveries}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{language === 'so' ? 'Wadarta' : 'Total'}</p>
        </Card>
        <Card className="p-3 text-center bg-green-500/5">
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </Card>
        <Card className="p-3 text-center bg-blue-500/5">
          <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
          <p className="text-xs text-muted-foreground">Processing</p>
        </Card>
        <Card className="p-3 text-center bg-yellow-500/5">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-3 text-center bg-red-500/5">
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-xs text-muted-foreground">Failed</p>
        </Card>
        <Card className="p-3 text-center bg-red-600/5">
          <p className="text-2xl font-bold text-red-700">{stats.cancelled}</p>
          <p className="text-xs text-muted-foreground">{language === 'so' ? 'La damiyay' : 'Cancelled'}</p>
        </Card>
      </div>

      {/* Auto-recovery status */}
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <RotateCcw className="h-4 w-4 text-primary animate-spin-slow" />
            <span className="font-medium">
              {language === 'so' ? 'Auto-recovery' : 'Auto-recovery'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">
                {language === 'so' ? 'Markii ugu dambeysay: ' : 'Last run: '}
              </span>
              {lastRecoveryAt
                ? `${formatDistanceToNow(lastRecoveryAt)} ${language === 'so' ? 'ka hor' : 'ago'}`
                : '—'}
            </div>
            <div>
              <span className="font-medium text-foreground">
                {language === 'so' ? 'Xigta: ' : 'Next: '}
              </span>
              {nextRecoveryAt
                ? (() => {
                    const sec = Math.max(0, Math.round((nextRecoveryAt.getTime() - nowTick.getTime()) / 1000));
                    return `${sec}s`;
                  })()
                : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Delivery Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{language === 'so' ? 'Delivery Feed' : 'Delivery Feed'}</CardTitle>
          <CardDescription>
            {language === 'so' ? 'Xirmadaha ugu dambeeyay ee la diro' : 'Latest package deliveries'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{language === 'so' ? 'Delivery ma jiro' : 'No deliveries yet'}</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {deliveries.map((delivery) => {
                  const statusInfo = getStatusInfo(delivery.status);
                  const StatusIcon = statusInfo.icon;
                  const timeline = getTimelineSteps(delivery);
                  const queueResult = getQueueResult(delivery);

                  return (
                    <Card key={delivery.id} className={`p-4 ${statusInfo.bg} border-l-4`} style={{ borderLeftColor: statusInfo.color.replace('text-', '') }}>
                      <div className="flex flex-col gap-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${statusInfo.bg}`}>
                              <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{delivery.provider_name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {(delivery.order as any)?.package_name || delivery.package_code || 'Package'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span className="font-mono">{delivery.receiver_phone}</span>
                              </div>
                            </div>
                          </div>
                          <Badge className={statusInfo.bg + ' ' + statusInfo.color}>
                            {statusInfo.label}
                          </Badge>
                          {isAutoRetrying(delivery) && (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-300 ml-1 animate-pulse">
                              🔄 {language === 'so' ? 'Dib u isku dayasho' : 'Auto-retrying'} {getRetryInfo(delivery) || ''}
                            </Badge>
                          )}
                          {delivery.error_message?.includes('Auto-retry') && delivery.status === 'failed' && (
                            <Badge className="bg-red-100 text-red-700 border-red-300 ml-1">
                              {language === 'so' ? '3 jeer waa la isku dayay' : 'Max retries reached'}
                            </Badge>
                          )}
                        </div>

                        {/* Timeline */}
                        <div className="flex items-center justify-between px-2">
                          {timeline.map((step, i) => (
                            <div key={step.label} className="flex items-center">
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${step.completed ? 'bg-green-500' : 'bg-muted'}`} />
                                <span className="text-xs mt-1 text-muted-foreground">{step.label}</span>
                                {step.time && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(step.time), 'HH:mm')}
                                  </span>
                                )}
                              </div>
                              {i < timeline.length - 1 && (
                                <div className={`h-0.5 w-12 sm:w-20 mx-1 ${step.completed ? 'bg-green-500' : 'bg-muted'}`} />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Details */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>USSD: <code className="bg-muted px-1 rounded">{delivery.ussd_code}</code></span>
                          {delivery.android_device_id && (
                            <span>Device: {delivery.android_device_id.slice(0, 8)}...</span>
                          )}
                          {delivery.attempts && delivery.attempts > 0 && (
                            <span>Attempts: {delivery.attempts}</span>
                          )}
                          <span>
                            {delivery.created_at && formatDistanceToNow(new Date(delivery.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        {/* Live Flow Steps Progress */}
                        {Array.isArray(delivery.flow_progress) && delivery.flow_progress.length > 0 && (() => {
                          const steps = [...delivery.flow_progress].sort((a: any, b: any) => (a.step || 0) - (b.step || 0));
                          const total = steps[0]?.total || steps.length;
                          const last = steps[steps.length - 1];
                          const isLive = delivery.status === 'processing' && steps.length < total;
                          return (
                            <details className="bg-blue-500/5 border border-blue-500/20 rounded p-2 text-xs">
                              <summary className="cursor-pointer flex items-center gap-2 font-medium text-blue-700">
                                <Radio className={`h-3 w-3 ${isLive ? 'animate-pulse text-blue-600' : ''}`} />
                                <span>
                                  {language === 'so' ? 'Tallaabooyinka USSD' : 'USSD Flow Steps'}: {steps.length}/{total}
                                </span>
                                {isLive && (
                                  <Badge className="bg-blue-100 text-blue-700 border-blue-300 animate-pulse text-[10px]">
                                    {language === 'so' ? 'SOCDA' : 'LIVE'}
                                  </Badge>
                                )}
                              </summary>
                              <ol className="mt-2 space-y-1.5 ml-1">
                                {Array.from({ length: total }).map((_, idx) => {
                                  const stepNo = idx + 1;
                                  const done = steps.find((s: any) => s.step === stepNo);
                                  const isCurrent = !done && stepNo === steps.length + 1 && isLive;
                                  return (
                                    <li key={stepNo} className="flex items-start gap-2">
                                      <span className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                                        done ? 'bg-green-500 text-white'
                                          : isCurrent ? 'bg-blue-500 text-white animate-pulse'
                                          : 'bg-muted text-muted-foreground'
                                      }`}>
                                        {done ? '✓' : isCurrent ? '⏳' : stepNo}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-muted-foreground">
                                          {done ? (
                                            <>
                                              <span className="font-medium text-foreground">{language === 'so' ? 'Qoray' : 'Typed'}: </span>
                                              <code className="bg-muted px-1 rounded">{done.response}</code>
                                              {done.is_pin && <span className="ml-1 text-orange-600">🔒</span>}
                                              {done.ts && <span className="ml-2 text-[10px]">{format(new Date(done.ts), 'HH:mm:ss')}</span>}
                                            </>
                                          ) : isCurrent ? (
                                            <span className="text-blue-600">{language === 'so' ? 'Sugaya jawaab...' : 'Waiting for dialog...'}</span>
                                          ) : (
                                            <span>{language === 'so' ? 'Sug' : 'Pending'}</span>
                                          )}
                                        </div>
                                        {done?.dialog && (
                                          <div className="text-[10px] text-muted-foreground/70 truncate" title={done.dialog}>
                                            ↳ {done.dialog}
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                              {last?.ts && (
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  {language === 'so' ? 'Tallaabadii ugu dambaysay' : 'Last step'}: {formatDistanceToNow(new Date(last.ts), { addSuffix: true })}
                                </div>
                              )}
                            </details>
                          );
                        })()}

                        {/* Delivery Result / Cancel Reason */}
                        {queueResult && (
                          <div className={`text-xs p-2 rounded ${
                            delivery.status === 'cancelled'
                              ? 'bg-red-500/10 text-red-700' 
                              : 'bg-green-500/10 text-green-700'
                          }`}>
                            <strong>
                              {delivery.status === 'cancelled'
                                ? (language === 'so' ? 'Sababta:' : 'Reason:')
                                : (language === 'so' ? 'Natiijada:' : 'Result:')}
                            </strong> {queueResult.replace('Cancelled: ', '')}
                          </div>
                        )}

                        {/* Error Message */}
                        {delivery.error_message && (
                          <div className="bg-red-500/10 text-red-600 text-xs p-2 rounded">
                            {delivery.error_message}
                          </div>
                        )}

                        {/* Duration for completed */}
                        {delivery.status === 'completed' && delivery.created_at && delivery.completed_at && (
                          <div className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Delivered in {Math.round((new Date(delivery.completed_at).getTime() - new Date(delivery.created_at).getTime()) / 1000)}s
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Manual Verify Button - Show when USSD sent but delivery failed/timeout */}
                          {needsManualVerify(delivery) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 gap-1"
                              onClick={() => handleManualVerify(delivery.order_id, delivery.id)}
                            >
                              <CheckCheck className="h-4 w-4" />
                              {language === 'so' ? 'Xaqiiji' : 'Verify'}
                            </Button>
                          )}


                          {/* Cancel Button - Show for delivered orders only */}
                          {delivery.order?.delivery_status === 'delivered' && (
                            <AlertDialog onOpenChange={(open) => { if (!open) setCancelReason(''); }}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100 gap-1"
                                >
                                  <Ban className="h-4 w-4" />
                                  {language === 'so' ? 'Dami' : 'Cancel'}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {language === 'so' ? 'Ma hubtaa inaad damiso order-kan?' : 'Cancel this order?'}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {language === 'so' 
                                      ? 'Qor sababta aad u damineyso order-kan.' 
                                      : 'Enter the reason for cancelling this order.'}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <Textarea
                                  placeholder={language === 'so' ? 'Sababta (tusaale: Macaamiilku xirmada ma helin)' : 'Reason (e.g. Customer did not receive package)'}
                                  value={cancelReason}
                                  onChange={(e) => setCancelReason(e.target.value)}
                                  className="min-h-[80px]"
                                />
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{language === 'so' ? 'Maya' : 'No'}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() => handleCancelOrder(delivery.order_id, delivery.id, cancelReason)}
                                  >
                                    {language === 'so' ? 'Haa, Dami' : 'Yes, Cancel'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {/* Restore Button - Show for cancelled orders only */}
                          {delivery.order?.delivery_status === 'cancelled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 gap-1"
                              onClick={() => handleRestoreOrder(delivery.order_id, delivery.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                              {language === 'so' ? 'Dib u Daar' : 'Restore'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
