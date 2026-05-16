import React from 'react';
import iftinLogo from '@/assets/iftin-logo.jpg';

const HeroSection = () => {
  return (
    <div className="text-center space-y-8">
      <div className="w-64 h-32 mx-auto mb-8">
        <img 
          src={iftinLogo} 
          alt="IFTIN Internet Services - Fastest and reliable internet provider"
          className="w-full h-full object-contain"
        />
      </div>
      
      <div className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Fastest and reliable internet
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
          buy here now !
        </h2>
      </div>
    </div>
  );
};

export default HeroSection;