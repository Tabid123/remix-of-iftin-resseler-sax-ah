import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';

const QUEUE_KEY = 'iftin_pending_intents_queue';
const MAX_ATTEMPTS = 5;

interface QueuedIntent {
  id: string;
  data: Record<string, any>;
  timestamp: number;
  attempts: number;
}

/**
 * Background sweeper that retries any pending_online_payments intents
 * that failed to insert during checkout. Keeps customer flow non-blocking.
 */
export function usePendingIntentSync() {
  const { isReallyOnline } = useConnectivity();
  const isSyncingRef = useRef(false);

  const sync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      let queue: QueuedIntent[] = [];
      try { queue = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(queue) || queue.length === 0) return;

      const successfulIds: string[] = [];
      const updatedQueue: QueuedIntent[] = [];

      for (const item of queue) {
        // Drop items older than 24h
        if (Date.now() - item.timestamp > 24 * 60 * 60 * 1000) {
          successfulIds.push(item.id);
          continue;
        }
        if (item.attempts >= MAX_ATTEMPTS) {
          // Keep but stop trying for now
          updatedQueue.push(item);
          continue;
        }
        try {
          const { error } = await supabase
            .from('pending_online_payments')
            .insert([item.data as any]);
          if (!error) {
            successfulIds.push(item.id);
            console.log('✅ Synced queued intent:', item.id);
          } else {
            updatedQueue.push({ ...item, attempts: item.attempts + 1 });
          }
        } catch {
          updatedQueue.push({ ...item, attempts: item.attempts + 1 });
        }
      }

      const remaining = queue.filter((i) =>
        !successfulIds.includes(i.id)
      ).map((i) => updatedQueue.find((u) => u.id === i.id) || i);

      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isReallyOnline) return;
    // Run once on mount/online
    sync();
    // Then every 30s while online
    const interval = window.setInterval(() => {
      if (navigator.onLine) sync();
    }, 30_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReallyOnline]);
}
