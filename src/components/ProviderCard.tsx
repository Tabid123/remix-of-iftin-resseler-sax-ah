import React from 'react';
import { Button } from '@/components/ui/button';

interface ProviderCardProps {
  name: string;
  logo: string;
  onClick: () => void;
  disabled?: boolean;
}

const ProviderCard = ({ name, logo, onClick, disabled = false }: ProviderCardProps) => {
  const getBrandClass = (providerName: string) => {
    const provider = providerName.toLowerCase();
    switch (provider) {
      case 'hormuud':
        return 'bg-white hover:bg-white/90 border-hormuud hover:border-hormuud text-foreground';
      case 'somtel':
        return 'bg-white hover:bg-white/90 border-somtel hover:border-somtel text-foreground';
      case 'somlink':
        return 'bg-white hover:bg-white/90 border-somlink hover:border-somlink text-foreground';
      case 'somnet':
        return 'bg-white hover:bg-white/90 border-somnet hover:border-somnet text-foreground';
      case 'amtel':
        return 'bg-white hover:bg-white/90 border-amtel hover:border-amtel text-foreground';
      default:
        return 'bg-white hover:bg-white/90 border-primary hover:border-primary text-foreground';
    }
  };

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={`h-24 w-full flex flex-col items-center justify-center gap-2 ${!disabled && 'hover:scale-105 active:scale-105'} transition-transform border-2 ${getBrandClass(name)} ${disabled && 'cursor-not-allowed'}`}
    >
      <div className="w-20 h-16 flex items-center justify-center p-1">
        <img
          src={logo}
          alt={`${name} logo`}
          className="w-full h-full object-contain bg-white rounded"
          loading="eager"
          decoding="async"
          style={{ imageRendering: '-webkit-optimize-contrast' }}
        />
      </div>
      <span className="text-sm font-medium text-foreground">{name}</span>
    </Button>
  );
};

export default ProviderCard;
