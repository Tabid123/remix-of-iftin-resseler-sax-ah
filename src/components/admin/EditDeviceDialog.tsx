import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

const PROVIDERS = ['Hormuud', 'Somnet', 'Somtel', 'Amtel', 'Somlink'];

interface EditDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: {
    id: string;
    device_id: string;
    device_name: string;
    sim1_provider: string | null;
    sim2_provider: string | null;
  } | null;
  onSuccess: () => void;
}

export const EditDeviceDialog = ({
  open,
  onOpenChange,
  device,
  onSuccess,
}: EditDeviceDialogProps) => {
  const { language } = useLanguage();
  const [deviceName, setDeviceName] = useState('');
  const [sim1Provider, setSim1Provider] = useState<string>('');
  const [sim2Provider, setSim2Provider] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (device && open) {
      setDeviceName(device.device_name || '');
      setSim1Provider(device.sim1_provider || '');
      setSim2Provider(device.sim2_provider || '');
    }
  }, [device, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deviceName.trim()) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Magaca device-ka waa loo baahan yahay' : 'Device name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!device) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('android_devices')
        .update({ 
          device_name: deviceName.trim(),
          sim1_provider: sim1Provider || null,
          sim2_provider: sim2Provider || null,
        })
        .eq('id', device.id);

      if (error) throw error;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' 
          ? 'Device-ka waa la bedelay' 
          : 'Device updated successfully',
      });
      
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating device:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' 
          ? 'Wax khaldan ayaa dhacay. Fadlan isku day mar kale.' 
          : 'Something went wrong. Please try again.',
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
          <DialogTitle>
            {language === 'so' ? 'Wax ka Badal Device-ka' : 'Edit Device'}
          </DialogTitle>
          <DialogDescription>
            {language === 'so' 
              ? 'Waxaad beddeli kartaa magaca iyo SIM-yada device-kan.' 
              : 'You can change the name and SIM providers for this device.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">
              {language === 'so' ? 'Magaca Device-ka' : 'Device Name'}
            </Label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={language === 'so' ? 'Geli magaca cusub' : 'Enter new name'}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>SIM 1 Provider</Label>
            <Select value={sim1Provider} onValueChange={setSim1Provider} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'so' ? 'Dooro Provider' : 'Select Provider'} />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>SIM 2 Provider ({language === 'so' ? 'Ikhtiyaari' : 'Optional'})</Label>
            <Select value={sim2Provider || 'none'} onValueChange={(val) => setSim2Provider(val === 'none' ? '' : val)} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'so' ? 'Dooro Provider' : 'Select Provider'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {language === 'so' ? 'Waxba' : 'None'}
                </SelectItem>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">
              Device ID
            </Label>
            <p className="text-sm font-mono bg-muted p-2 rounded">
              {device?.device_id}
            </p>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'so' ? 'Kaydi' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
