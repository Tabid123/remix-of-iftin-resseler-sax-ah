import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Phone, ChevronRight, LogOut, Star, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { BottomNavigation } from '@/components/BottomNavigation';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { supabase } from '@/integrations/supabase/client';
import { useBrand } from '@/hooks/useBrand';

const Profile = () => {
  const navigate = useNavigate();
  const { name: brandName, primary } = useBrand();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    showBannerAd();
    return () => {
      hideBannerAd();
    };
  }, []);

  const verifiedPhone = localStorage.getItem('verifiedPhone');
  const phoneNumber =
    localStorage.getItem('userPhone') ||
    localStorage.getItem('verifiedPhoneNumber') ||
    localStorage.getItem('userPhoneNumber') ||
    localStorage.getItem('verificationPhone') ||
    localStorage.getItem('phoneNumber') ||
    '';

  const handleLogout = () => {
    localStorage.removeItem('verifiedPhone');
    localStorage.removeItem('userPhone');
    localStorage.removeItem('verifiedPhoneNumber');
    localStorage.removeItem('userPhoneNumber');
    localStorage.removeItem('verificationPhone');
    localStorage.removeItem('phoneNumber');
    localStorage.removeItem('profileImage');
    localStorage.removeItem('hasSkippedOfflineRegistration');
    localStorage.removeItem('offlineSenderPhone');
    localStorage.removeItem('offlineReceiverPhone');
    toast.success('Waa laga baxay guul ahaan');
    navigate('/', { replace: true });
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const phone = verifiedPhone || phoneNumber;
      if (phone) {
        await supabase.from('verified_phones').delete().eq('phone_number', phone);
        await supabase.from('orders').delete().or(`customer_phone.eq.${phone},sender_phone.eq.${phone}`);
      }
      localStorage.clear();
      setIsDeleteDialogOpen(false);
      toast.success('Account-kaaga waa la tirtiray');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('Khalad ayaa dhacay, fadlan dib u isku day');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: brandName,
      text: `Soo degso ${brandName} - Internet bundles iibso si fudud!`,
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Link waa la copy-gareeye!');
      }
    } catch (err) {}
  };

  const profileOptions = [
    { icon: MessageCircle, title: 'Chat on Whatsapp', action: () => window.open('https://wa.link/ake9qi', '_blank') },
    { icon: Phone, title: 'Customer support call', action: () => window.open('tel:+252617195659', '_self') },
    { icon: Star, title: 'Qiimey Iftin App', action: () => window.open('https://play.google.com/store/apps/details?id=app.lovable.5178b6a28d534275a37667022407be64', '_blank') },
    { icon: Share2, title: 'Lawadaag Asxaabtaada', action: handleShare },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        style={{
           backgroundColor: primary,
          paddingTop: 'calc(0.75rem + var(--effective-safe-area-top, 0px))',
          boxSizing: 'border-box' as const
        }}
        className="py-3 px-4 text-white"
      >
        <div className="mb-3 flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-4 text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-4 pb-1">
          <div>
            {phoneNumber ? (
              <p className="text-lg font-medium text-white">+252{phoneNumber}</p>
            ) : (
              <p className="text-lg font-medium text-white">Ma gelin</p>
            )}
            <p className="text-sm text-white/70">
              {verifiedPhone ? 'Verified Account' : 'Not Verified'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 p-4">
        {profileOptions.map((option, index) => (
          <div key={index} onClick={option.action} className="flex cursor-pointer items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <option.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-foreground">{option.title}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        ))}

        <div onClick={handleLogout} className="flex cursor-pointer items-center justify-between rounded-lg border border-destructive/20 bg-destructive/10 p-4 transition-colors hover:bg-destructive/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <span className="font-medium text-destructive">Log Out</span>
          </div>
          <ChevronRight className="h-5 w-5 text-destructive/70" />
        </div>

        <div
          onClick={() => setIsDeleteDialogOpen(true)}
          className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-destructive/10 bg-destructive/5 p-4 transition-colors hover:bg-destructive/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/15">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <span className="font-medium text-destructive">Delete Account</span>
          </div>
          <ChevronRight className="h-5 w-5 text-destructive/70" />
        </div>
      </div>

      {isDeleteDialogOpen && (
        <div className="absolute inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => !isDeletingAccount && setIsDeleteDialogOpen(false)}
          />
          <div className="absolute inset-x-4 top-1/2 z-10 mx-auto w-auto max-w-sm -translate-y-1/2 rounded-2xl border bg-background p-5 shadow-xl">
            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold text-foreground">
                Are you sure you want to delete your account?
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                This action is permanent and all your data will be removed. This cannot be undone.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="w-full"
              >
                {isDeletingAccount ? 'Deleting...' : 'Delete Account'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isDeletingAccount}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNavigation />
    </div>
  );
};

export default Profile;
