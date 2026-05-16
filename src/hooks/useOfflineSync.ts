import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';

interface QueuedOrder {
  id: string;
  data: any;
  timestamp: number;
}

const QUEUE_KEY = 'iftin_queued_orders';

export const useOfflineSync = () => {
  const { isReallyOnline } = useConnectivity();
  const [queuedOrders, setQueuedOrders] = useState<QueuedOrder[]>([]);

  useEffect(() => {
    // Load queued orders from localStorage
    const loadQueue = () => {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        try {
          setQueuedOrders(JSON.parse(stored));
        } catch (error) {
          console.error('Error loading queued orders:', error);
        }
      }
    };

    loadQueue();
  }, []);

  // Sync queued orders when coming back online
  useEffect(() => {
    if (isReallyOnline && queuedOrders.length > 0) {
      syncQueuedOrders();
    }
  }, [isReallyOnline]); // Removed queuedOrders.length to prevent multiple syncs

  const queueOrder = (orderData: any) => {
    // Single-flight guard: prevent the SAME button being double-tapped within 3s
    // (does NOT block legitimate repeat purchases — only kills double clicks)
    try {
      const sig = [
        orderData?.sender_phone || '',
        orderData?.receiver_phone || '',
        orderData?.package_id || '',
        Number(orderData?.selling_price || 0).toFixed(2),
      ].join('|');
      const key = 'iftin_last_queue_signature';
      const lastRaw = localStorage.getItem(key);
      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw);
          if (last?.sig === sig && Date.now() - Number(last.ts || 0) < 3000) {
            console.warn('🛑 Duplicate queue within 3s — ignored');
            return last.id || '';
          }
        } catch {}
      }
      const newId = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify({ sig, ts: Date.now(), id: newId }));

      const queuedOrder: QueuedOrder = {
        id: newId,
        data: orderData,
        timestamp: Date.now(),
      };
      const newQueue = [...queuedOrders, queuedOrder];
      setQueuedOrders(newQueue);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
      return queuedOrder.id;
    } catch {
      // Fallback: original behaviour
      const queuedOrder: QueuedOrder = {
        id: crypto.randomUUID(),
        data: orderData,
        timestamp: Date.now(),
      };
      const newQueue = [...queuedOrders, queuedOrder];
      setQueuedOrders(newQueue);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
      return queuedOrder.id;
    }
  };

  const syncQueuedOrders = async () => {
    if (queuedOrders.length === 0) return;

    const successfulIds: string[] = [];

    for (const queuedOrder of queuedOrders) {
      try {
        // Safety guard: ensure payment_source is set so DB default doesn't kick in
        const orderData = {
          ...queuedOrder.data,
          payment_source: queuedOrder.data.payment_source || 'sms_offline',
        };
        const { error } = await supabase
          .from('orders')
          .insert(orderData);

        if (!error) {
          successfulIds.push(queuedOrder.id);
        }
      } catch (error) {
        // Silent error handling
      }
    }

    // Remove successfully synced orders from queue
    if (successfulIds.length > 0) {
      const remainingQueue = queuedOrders.filter(
        order => !successfulIds.includes(order.id)
      );
      setQueuedOrders(remainingQueue);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
    }
  };

  return {
    isOnline: isReallyOnline,
    queuedOrders,
    queueOrder,
    syncQueuedOrders,
  };
};
