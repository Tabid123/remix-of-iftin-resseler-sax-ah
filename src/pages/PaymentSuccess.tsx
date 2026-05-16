import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { logScreenView, logPurchase } from '@/services/firebase';
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [orderDetails, setOrderDetails] = React.useState<any>(null);
  const {
    package: packageData,
    paymentMethod,
    receiverNumber,
    isOffline,
    ussdCode,
    iftinPaymentNumber
  } = location.state || {};
  useEffect(() => {
    // Log screen view and purchase
    logScreenView('PaymentSuccess');
    if (packageData) {
      logPurchase(
        packageData.name || packageData.package_name || 'Unknown',
        packageData.price ? parseFloat(packageData.price.replace('$', '')) : 0,
        paymentMethod || 'Unknown'
      );
    }

    // 🎉 Fire confetti celebration!
    const fireConfetti = () => {
      // First burst from left
      confetti({
        particleCount: 100,
        spread: 70,
        origin: {
          x: 0.1,
          y: 0.6
        },
        colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
      });

      // Second burst from right
      confetti({
        particleCount: 100,
        spread: 70,
        origin: {
          x: 0.9,
          y: 0.6
        },
        colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
      });

      // Center burst after small delay
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: {
            x: 0.5,
            y: 0.5
          },
          colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7']
        });
      }, 200);
    };

    // Fire confetti for all successful payments
    fireConfetti();

    // Invalidate featured packages query to refresh the data
    queryClient.invalidateQueries({
      queryKey: ['featuredPackages']
    });

    // Get the last order from history
    const history = JSON.parse(localStorage.getItem('orderHistory') || '[]');
    if (history.length > 0) {
      setOrderDetails(history[0]);
    }
  }, [queryClient, isOffline]);
  return <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md animate-bounce-in w-full">
        <div className="space-y-4 animate-slide-up">
          <div className="relative">
            <CheckCircle className="w-24 h-24 text-green-500 mx-auto animate-bounce" />
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
          </div>
          <h1 className="text-2xl font-bold text-foreground animate-fade-in">
            Hambalyo! Dalabkaaga Waala diray Mahadsanid ✅
          </h1>
          
        </div>



        <Button onClick={() => navigate('/providers')} className="w-full gradient-button text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity animate-slide-up">
          Continue
        </Button>
      </div>
    </div>;
};
export default PaymentSuccess;