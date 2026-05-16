import React from 'react';
import { Loader2 } from 'lucide-react';

interface PaymentLoadingOverlayProps {
  isLoading: boolean;
}

export const PaymentLoadingOverlay: React.FC<PaymentLoadingOverlayProps> = ({ 
  isLoading
}) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Blurred background */}
      <div className="absolute inset-0 bg-background/40 backdrop-blur-md" />
      
      {/* Loading animation */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4">
        <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center shadow-2xl">
          <Loader2 className="w-10 h-10 text-primary-foreground animate-spin" />
        </div>
        <p className="mt-4 text-base font-medium text-foreground">
          Diyaarinaya lacag bixinta...
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fadlan sug wax yar.
        </p>
      </div>
    </div>
  );
};
