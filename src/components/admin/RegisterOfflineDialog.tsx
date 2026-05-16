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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserPlus } from 'lucide-react';

interface Provider { id: string; provider_name: string; }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  senderPhone: string;
  defaultReceiverPhone?: string;
  onSuccess?: () => void;
}

const normalize = (p: string) => {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('252')) d = d.substring(3);
  if (d.startsWith('0') && d.length === 10) d = d.substring(1);
  return d.slice(-9);
};

export const RegisterOfflineDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  senderPhone,
  defaultReceiverPhone,
  onSuccess,
}) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [receiver, setReceiver] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReceiver(defaultReceiverPhone || senderPhone || '');
    setProviderId('');
    (async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');
      setProviders(data || []);
    })();
  }, [open, senderPhone, defaultReceiverPhone]);

  const handleSave = async () => {
    if (!providerId) {
      toast({ title: 'Fadlan dooro shirkadda', variant: 'destructive' });
      return;
    }
    const r = normalize(receiver);
    const s = normalize(senderPhone);
    if (r.length < 9 || s.length < 9) {
      toast({ title: 'Lambaro khalad ah', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const provider = providers.find(p => p.id === providerId);
      // Check if active registration already exists
      const { data: existing } = await supabase
        .from('offline_registrations')
        .select('id, is_active')
        .eq('sender_phone', s)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('offline_registrations')
          .update({
            receiver_phone: r,
            provider_id: providerId,
            provider_name: provider?.provider_name || '',
          })
          .eq('id', existing.id);
      } else {
        const { error } = await supabase.from('offline_registrations').insert({
          sender_phone: s,
          receiver_phone: r,
          provider_id: providerId,
          provider_name: provider?.provider_name || '',
          is_active: true,
        });
        if (error) throw error;
      }

      toast({ title: '✅ Lambarka waa la diiwaangeliyay' });
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Khalad', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Diiwaangeli Lambar Offline
          </DialogTitle>
          <DialogDescription>
            Sender: <span className="font-mono">{senderPhone}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Shirkadda</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Dooro shirkadda" /></SelectTrigger>
              <SelectContent>
                {providers.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Numberka Qaataha (Receiver)</Label>
            <Input
              type="tel"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="61XXXXXXX"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Ka noqo
            </Button>
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Kaydinaya...</> : 'Kaydi'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
