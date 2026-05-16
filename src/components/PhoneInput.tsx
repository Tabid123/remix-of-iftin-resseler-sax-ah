import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import somaliaFlag from '@/assets/somalia-flag-hq.png';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldCheck } from 'lucide-react';

const PhoneInput = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPrefixError, setShowPrefixError] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const generateVerificationCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 9) {
      setPhoneNumber(value);
      setShowPrefixError(false);
    }
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli lambarka telefoonkaaga",
        variant: "destructive",
      });
      return;
    }

    const allowedPrefixes = ['61', '77', '62', '68'];
    const hasAllowedPrefix = allowedPrefixes.some(prefix => phoneNumber.startsWith(prefix));
    
    if (!hasAllowedPrefix || phoneNumber.length !== 9) {
      setShowPrefixError(true);
      toast({
        title: "Error",
        description: "Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;
    
    try {
      // Check if phone is already verified
      const { data: existingPhone } = await supabase
        .from('verified_phones')
        .select('id, verified_at')
        .eq('phone_number', fullPhoneNumber)
        .maybeSingle();
      
      if (existingPhone) {
        setIsReturningUser(true);
      }

      // Show code on screen directly - no SMS needed
      setGeneratedCode(code);
      setIsCodeSent(true);
      localStorage.setItem('verificationCode', code);
      localStorage.setItem('codeTimestamp', Date.now().toString());
      localStorage.setItem('pendingPhone', phoneNumber);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Wax khalad ah ayaa dhacay',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendCode = () => {
    const code = generateVerificationCode();
    setGeneratedCode(code);
    localStorage.setItem('verificationCode', code);
    localStorage.setItem('codeTimestamp', Date.now().toString());
    setVerificationCode('');
    toast({
      title: "Code cusub!",
      description: "Koodka cusub ayaa shaashada kugu soo muuqday",
    });
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli koodka xaqiijinta",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    
    const storedCode = localStorage.getItem('verificationCode');
    const codeTimestamp = localStorage.getItem('codeTimestamp');
    
    if (codeTimestamp) {
      const timeElapsed = (Date.now() - parseInt(codeTimestamp)) / 1000;
      if (timeElapsed > 120) {
        toast({
          title: "Koodka wuu dhacay",
          description: "Fadlan code cusub soo codso",
          variant: "destructive",
        });
        setIsVerifying(false);
        return;
      }
    }
    
    if (verificationCode === storedCode) {
      try {
        const fullPhoneNumber = `+252${phoneNumber}`;
        
        const { data: existingPhone } = await supabase
          .from('verified_phones')
          .select('id')
          .eq('phone_number', fullPhoneNumber)
          .maybeSingle();
        
        if (existingPhone) {
          await supabase
            .from('verified_phones')
            .update({ last_login_at: new Date().toISOString() })
            .eq('phone_number', fullPhoneNumber);
        } else {
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
      
      localStorage.setItem('verifiedPhone', phoneNumber);
      localStorage.setItem('userPhone', phoneNumber);
      localStorage.removeItem('verificationCode');
      localStorage.removeItem('codeTimestamp');
      localStorage.removeItem('pendingPhone');
      
      toast({
        title: "Guul!",
        description: "Lambarka telefoonka waa la xaqiijiyay",
      });
      
      setIsVerifying(false);
      navigate('/offline-mode');
    } else {
      toast({
        title: "Kood khaldan",
        description: "Koodka aad gelisay waa khalad",
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {!isCodeSent ? (
        <>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium text-muted-foreground">
              Geli lambarka telefoonkaaga
            </label>
            <div className="flex space-x-2">
              <div className="flex items-center gap-2 bg-card border border-input rounded-lg px-3 py-2 text-sm font-medium">
                <img src={somaliaFlag} alt="Calanka Somalia" className="w-7 h-5 object-cover rounded" />
                <span>+252</span>
              </div>
              <Input
                id="phone"
                type="tel"
                placeholder="61 xxx xxxx"
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
                maxLength={9}
                className="flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] focus:outline-none focus:ring-2"
              />
            </div>
            {showPrefixError && (
              <p className="text-sm text-red-500">
                Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay
              </p>
            )}
          </div>
          
          <Button 
            onClick={handleSendCode}
            disabled={isSending}
            className="w-full gradient-button text-white font-semibold py-3 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Login'
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="text-center space-y-2">
            {isReturningUser && (
              <p className="text-sm font-medium text-primary mb-2">
                🎉 Soo dhawaaw mar kale!
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Xaqiijinta lambarka +252 {phoneNumber}
            </p>
          </div>

          {/* Show code on screen */}
          <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-6 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-medium">Koodkaagu waa</span>
            </div>
            <div className="flex justify-center gap-3">
              {generatedCode.split('').map((digit, i) => (
                <span key={i} className="text-4xl font-bold text-primary bg-primary/10 rounded-xl w-14 h-16 flex items-center justify-center">
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Geli koodkan hoosta</p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium text-muted-foreground">
              Koodka Xaqiijinta
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
                <img 
                  src={somaliaFlag} 
                  alt="Somalia Flag" 
                  className="w-7 h-5 object-cover rounded"
                />
              </div>
              <div className="flex gap-2 flex-1 justify-center">
                {[0, 1, 2, 3].map((index) => (
                  <Input
                    key={index}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    value={verificationCode[index] || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      if (value.length > 1) {
                        const digits = value.slice(0, 4).split('');
                        setVerificationCode(digits.join('').padEnd(4, ''));
                        const lastIndex = Math.min(digits.length - 1, 3);
                        setTimeout(() => {
                          const lastInput = document.querySelectorAll('input[type="text"]')[lastIndex] as HTMLInputElement;
                          lastInput?.focus();
                        }, 0);
                      } else if (value) {
                        const newCode = verificationCode.split('');
                        newCode[index] = value;
                        setVerificationCode(newCode.join(''));
                        if (index < 3) {
                          const nextInput = document.querySelectorAll('input[type="text"]')[index + 1] as HTMLInputElement;
                          nextInput?.focus();
                        }
                      } else {
                        const newCode = verificationCode.split('');
                        newCode[index] = '';
                        setVerificationCode(newCode.join(''));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace') {
                        if (verificationCode[index]) {
                          const newCode = verificationCode.split('');
                          newCode[index] = '';
                          setVerificationCode(newCode.join(''));
                          e.preventDefault();
                        } else if (index > 0) {
                          const prevInput = document.querySelectorAll('input[type="text"]')[index - 1] as HTMLInputElement;
                          const newCode = verificationCode.split('');
                          newCode[index - 1] = '';
                          setVerificationCode(newCode.join(''));
                          prevInput?.focus();
                          e.preventDefault();
                        }
                      } else if (e.key === 'Delete') {
                        const newCode = verificationCode.split('');
                        newCode[index] = '';
                        setVerificationCode(newCode.join(''));
                        e.preventDefault();
                      }
                    }}
                    className="w-14 h-14 text-center text-2xl font-semibold focus:border-[#0099ff] focus:ring-[#0099ff] focus:outline-none focus:ring-2"
                  />
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              className="text-[#0099ff] hover:underline text-sm"
              onClick={handleResendCode}
            >
              Code cusub
            </button>
          </div>
          
          <Button 
            onClick={handleVerifyCode}
            disabled={isVerifying}
            className="w-full gradient-button text-white font-semibold py-3 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isVerifying ? 'Waa la xaqiijinayaa...' : 'Verify'}
          </Button>
          
          <Button 
            variant="ghost"
            onClick={() => setIsCodeSent(false)}
            className="w-full"
          >
            Bedel Lambarka Telefoonka
          </Button>
        </>
      )}
    </div>
  );
};

export default PhoneInput;