import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(() => {
    return localStorage.getItem('lastSeenNotification');
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['user-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Notification[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          console.log('New notification received:', payload);
          queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Calculate unread count
  const unreadCount = notifications?.filter((notif) => {
    if (!lastSeenTimestamp) return true;
    return new Date(notif.created_at) > new Date(lastSeenTimestamp);
  }).length || 0;

  // Mark all as seen
  const markAsSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem('lastSeenNotification', now);
    setLastSeenTimestamp(now);
  };

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsSeen,
  };
}
