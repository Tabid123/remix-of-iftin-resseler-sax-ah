import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import { setUserPhone } from '@/services/onesignal';

interface PhoneVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  paymentProvider: string;
  packageData: any;
}

const PhoneVerification = ({ isOpen, onClose, onSuccess, paymentProvider, packageData }: PhoneVerificationProps) => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [canResend, setCanResend] = useState(true);
  const [providerLogo, setProviderLogo] = useState('');
  const [showPrefixError, setShowPrefixError] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 9) {
      setPhoneNumber(value);
      setShowPrefixError(false);
      
      // Show provider logo based on prefix
      if (value.startsWith('61') || value.startsWith('77')) {
        setProviderLogo(hormuudLogo);
      } else if (value.startsWith('62')) {
        setProviderLogo(somtelLogo);
      } else if (value.startsWith('68')) {
        setProviderLogo(somnetLogo);
      } else if (value.startsWith('71')) {
        setProviderLogo(amtelLogo);
      } else if (value.startsWith('64')) {
        setProviderLogo(somlinkLogo);
      } else {
        setProviderLogo('');
      }
    }
  };

  const handleSendCode = async () => {
    console.log('handleSendCode called');
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter your phone number",
        variant: "destructive",
      });
      return;
    }

    // Validate phone number prefix
    const validPrefixes = ['61', '77', '62', '68', '71', '64'];
    const hasValidPrefix = validPrefixes.some(prefix => phoneNumber.startsWith(prefix));
    
    if (!hasValidPrefix || phoneNumber.length !== 9) {
      setShowPrefixError(true);
      toast({
        title: "Error",
        description: "Fadlan geli lambarka sax ah",
        variant: "destructive",
      });
      return;
    }
    // Generate code and queue for Android device to send via SMS
    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;
    
    // Detect provider from phone prefix
    const getProviderFromPhone = (phone: string): string => {
      const prefix = phone.substring(0, 2);
      if (prefix === '61' || prefix === '77') return 'hormuud';
      if (prefix === '62') return 'somtel';
      if (prefix === '68') return 'somnet';
      if (prefix === '71') return 'amtel';
      if (prefix === '64') return 'somlink';
      return 'hormuud';
    };
    
    const provider = getProviderFromPhone(phoneNumber);
    console.log('Queueing OTP for Android SMS sending:', { fullPhoneNumber, code, provider });
    
    try {
      const { data, error } = await supabase.functions.invoke('queue-otp', {
        body: { phoneNumber: fullPhoneNumber, code }
      });

      console.log('Queue OTP response:', { data, error });

      if (error) {
        throw error;
      }

      toast({
        title: "Code sent!",
        description: `Verification code sent to +252 ${phoneNumber}`,
      });
      
      setIsCodeSent(true);
      setCanResend(false);
      setResendTimer(60); // 1 minute
      localStorage.setItem('verificationCode', code);
    } catch (error) {
      console.error('Error queueing OTP:', error);
      const supaErr: any = error;
      let ctx: any = {};
      const rawCtx = supaErr?.context ?? supaErr?.details ?? null;
      if (typeof rawCtx === 'string') {
        try { ctx = JSON.parse(rawCtx); } catch { ctx = { errorMessage: rawCtx }; }
      } else if (typeof rawCtx === 'object' && rawCtx) {
        ctx = rawCtx;
      }

      const errorMessage =
        ctx?.errorMessage || ctx?.message || ctx?.error || supaErr?.message || 'Failed to send verification code.';

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    
    console.log('handleResendCode called');
    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;
    
    // Detect provider from phone prefix
    const getProviderFromPhone = (phone: string): string => {
      const prefix = phone.substring(0, 2);
      if (prefix === '61' || prefix === '77') return 'hormuud';
      if (prefix === '62') return 'somtel';
      if (prefix === '68') return 'somnet';
      if (prefix === '71') return 'amtel';
      if (prefix === '64') return 'somlink';
      return 'hormuud';
    };
    
    const provider = getProviderFromPhone(phoneNumber);
    console.log('Queueing OTP resend:', { fullPhoneNumber, code, provider });
    
    try {
      const { data, error } = await supabase.functions.invoke('queue-otp', {
        body: { phoneNumber: fullPhoneNumber, code }
      });

      console.log('Resend queue-otp response:', { data, error });

      if (error) {
        throw error;
      }

      localStorage.setItem('verificationCode', code);
      setCanResend(false);
      setResendTimer(60);
      
      toast({
        title: "Code sent!",
        description: `Verification code sent to +252 ${phoneNumber}`,
      });
    } catch (error) {
      console.error('Error resending OTP:', error);
      const supaErr: any = error;
      let ctx: any = {};
      const rawCtx = supaErr?.context ?? supaErr?.details ?? null;
      if (typeof rawCtx === 'string') {
        try { ctx = JSON.parse(rawCtx); } catch { ctx = { errorMessage: rawCtx }; }
      } else if (typeof rawCtx === 'object' && rawCtx) {
        ctx = rawCtx;
      }

      const errorMessage =
        ctx?.errorMessage || ctx?.message || ctx?.error || supaErr?.message || 'Failed to resend verification code.';

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter the verification code",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    
    const storedCode = localStorage.getItem('verificationCode');
    const isValidCode = verificationCode === storedCode;
    
    if (isValidCode) {
      try {
        const fullPhoneNumber = `+252${phoneNumber}`;
        
        // Check if phone already exists in verified_phones
        const { data: existingPhone } = await supabase
          .from('verified_phones')
          .select('id')
          .eq('phone_number', fullPhoneNumber)
          .maybeSingle();
        
        if (existingPhone) {
          // Update last login
          await supabase
            .from('verified_phones')
            .update({ last_login_at: new Date().toISOString() })
            .eq('phone_number', fullPhoneNumber);
        } else {
          // Insert new verified phone
          await supabase
            .from('verified_phones')
            .insert({
              phone_number: fullPhoneNumber,
              verification_code: storedCode,
              verified_at: new Date().toISOString(),
              last_login_at: new Date().toISOString()
            });
        }
      } catch (error) {
        console.error('Error saving verified phone:', error);
      }
      
      // Save verified phone WITHOUT +252 prefix to match database format
      localStorage.setItem('verifiedPhone', phoneNumber);
      localStorage.setItem('userPhoneNumber', phoneNumber);
      
      // Set user phone for OneSignal targeting
      setUserPhone(phoneNumber);
      
      toast({
        title: "Verification successful!",
        description: "Fadlan diiwaangeli lambaradaada.",
      });
      localStorage.removeItem('verificationCode');
      setIsVerifying(false);
      onClose();
      navigate('/offline-mode');
    } else {
      toast({
        title: "Invalid code",
        description: "The verification code you entered is incorrect.",
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Phone Verification</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {!isCodeSent ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
                    <img 
                      src={somaliaFlag} 
                      alt="Somalia Flag" 
                      className="w-7 h-5 object-cover rounded"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      width={28}
                      height={20}
                    />
                    <span className="text-sm font-medium">+252</span>
                  </div>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="61 xxx xxxx"
                    value={phoneNumber}
                    onChange={handlePhoneNumberChange}
                    maxLength={9}
                    className="flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] [&:focus]:text-[#0099ff] focus:outline-none focus:ring-2"
                  />
                </div>
                {providerLogo && (
                  <div className="flex justify-center mt-3 p-2 bg-muted/30 rounded-lg">
                    <img 
                      src={providerLogo} 
                      alt="Provider Logo" 
                      className="w-16 h-12 object-contain"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  </div>
                )}
                {showPrefixError && (
                  <p className="text-sm text-red-500">
                    Fadlan geli lambarka sax ah. Isticmaal: 61/77 (Hormuud), 62 (Somtel), 68 (Somnet), 71 (Amtel), 64 (Somlink)
                  </p>
                )}
              </div>
              
              <Button 
                onClick={handleSendCode}
                className="w-full gradient-button text-white hover:opacity-90 transition-opacity"
              >
                Send Code
              </Button>
            </>
          ) : (
            <>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code sent to
                </p>
                <p className="font-medium">+252 {phoneNumber}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
                    <img 
                      src={somaliaFlag} 
                      alt="Somalia Flag" 
                      className="w-7 h-5 object-cover rounded"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      width={28}
                      height={20}
                    />
                    {providerLogo && (
                      <img 
                        src={providerLogo} 
                        alt="Provider Logo" 
                        className="w-8 h-6 object-contain ml-1"
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                      />
                    )}
                  </div>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      // Allow: backspace, delete, tab, escape, enter, arrows
                      if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        return;
                      }
                      // Block non-numeric keys
                      if (!/^\d$/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className="flex-1 text-center text-lg tracking-widest focus:border-[#0099ff] focus:ring-[#0099ff] focus:outline-none focus:ring-2"
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground"></span>
                <button 
                  className={`text-[#0099ff] ${!canResend ? 'opacity-50 cursor-not-allowed' : 'hover:underline'}`}
                  onClick={handleResendCode}
                  disabled={!canResend}
                >
                  {canResend ? 'Dib u dir' : `Dib u dir (${resendTimer}s)`}
                </button>
              </div>
              
              <Button 
                onClick={handleVerifyCode}
                disabled={isVerifying}
                className="w-full gradient-button text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Xaqiijo Code'}
              </Button>
              
              <Button 
                variant="ghost"
                onClick={() => setIsCodeSent(false)}
                className="w-full"
              >
                Change Phone Number
              </Button>
              
              <div className="text-center text-xs text-muted-foreground mt-4">
                Developed by Saabir
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhoneVerification;