import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConnectivity } from '@/contexts/ConnectivityContext';

interface OfflinePhoneInputSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OfflinePhoneInputSheet = ({ open, onOpenChange }: OfflinePhoneInputSheetProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isReallyOnline } = useConnectivity();
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  // Get saved phone numbers for placeholders
  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';

  const detectProvider = (phone: string): { id: string; name: string } | null => {
    const prefix = phone.substring(0, 2);
    
    const providerMap: { [key: string]: { id: string; name: string } } = {
      '61': { id: 'hormuud', name: 'Hormuud' },
      '68': { id: 'somnet', name: 'Somnet' },
      '62': { id: 'somtel', name: 'Somtel' },
      '71': { id: 'amtel', name: 'Amtel' },
      '64': { id: 'somlink', name: 'Somlink' },
    };

    return providerMap[prefix] || null;
  };

  const handleContinue = async () => {
    // Check connectivity status
    const isOnline = isReallyOnline === true;
    
    // Check if online before allowing changes
    if (!isOnline) {
      toast({
        variant: "destructive",
        title: "Internet la'aan",
        description: "Waxaad u baahan tahay internet si aad u baddasho lambarada",
        duration: 3000,
      });
      return;
    }

    // Detect if ADSL based on receiver phone number starting with 1
    const isADSL = receiverPhone.startsWith('1');
    
    // ADSL validation: 7 digits starting with 1
    if (isADSL) {
      if (!/^1\d{6}$/.test(receiverPhone)) {
        toast({
          variant: "destructive",
          title: "Khalad",
          description: "ADSL-ka wuxuu u baahan yahay 7 lambar bilaabanaya 1",
          duration: 3000,
        });
        return;
      }
    } else {
      // Mobile validation: 9 digits
      if (!/^\d{9}$/.test(senderPhone) || !/^\d{9}$/.test(receiverPhone)) {
        toast({
          variant: "destructive",
          title: "Khalad",
          description: "Fadlan geli lambar saxan (9 tiro)",
          duration: 3000,
        });
        return;
      }
    }
    
    // Validate sender phone (always 9 digits)
    if (!/^\d{9}$/.test(senderPhone)) {
      toast({
        variant: "destructive",
        title: "Khalad",
        description: "Lambarka laga dirayo waa inuu ahaadaa 9 lambar",
        duration: 3000,
      });
      return;
    }

    const provider = isADSL ? { id: 'adsl', name: 'ADSL' } : detectProvider(receiverPhone);
    
    if (provider) {
      // Save phone numbers to localStorage
      localStorage.setItem('offlineSenderPhone', senderPhone);
      localStorage.setItem('offlineReceiverPhone', receiverPhone);

      // Save to database if online
      if (isOnline) {
        try {
          const { data: providerData } = await supabase
            .from('providers_config')
            .select('id')
            .ilike('provider_name', provider.name)
            .maybeSingle();

          if (providerData) {
            // Upsert registration (update if exists, insert if not)
            const { error: upsertError } = await supabase
              .from('offline_registrations')
              .upsert({
                sender_phone: senderPhone,
                receiver_phone: receiverPhone,
                provider_id: providerData.id,
                provider_name: provider.name,
                is_active: true
              }, {
                onConflict: 'sender_phone'
              });

            if (!upsertError) {
              toast({
                title: "Lagu guuleystay",
                description: "Lambarada ayaa database-ka lagu kaydiyey",
                duration: 2000,
              });
            }
          }
        } catch (error) {
          console.error('Registration save error:', error);
        }
      }
      
      navigate(`/categories/${provider.id}`, {
        state: {
          providerName: provider.name,
          senderPhone,
          receiverPhone,
          isOffline: true
        }
      });
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader>
          <SheetTitle>Macluumaadka Offline</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sender-phone">Lambarka laga dirayo</Label>
            <Input
              id="sender-phone"
              type="tel"
              placeholder={savedSenderPhone || "tusaale 61xxxxxxx"}
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receiver-phone">Lambarka loo dirayo ama xirmada loo rabo</Label>
            <Input
              id="receiver-phone"
              type="tel"
              placeholder={savedReceiverPhone || "Mobile: 61xxxxxxx | ADSL: 1xxxxxx"}
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mobile: 9 lambar (61xxxxxxx) | ADSL: 7 lambar (1xxxxxx)
            </p>
          </div>

          <Button 
            onClick={handleContinue}
            className="w-full"
            disabled={!senderPhone || !receiverPhone}
          >
            Bedel Lambarka
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OfflinePhoneInputSheet;
