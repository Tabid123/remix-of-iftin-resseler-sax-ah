import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useBrand } from '@/hooks/useBrand';

const providerColors: Record<string, { light: string; dark: string }> = {
  hormuud: { light: '#00c853', dark: '#00c853' },
  somtel: { light: '#ffd600', dark: '#ffd600' },
  somlink: { light: '#9c27b0', dark: '#9c27b0' },
  somnet: { light: '#42a5f5', dark: '#42a5f5' },
  amtel: { light: '#ef5350', dark: '#ef5350' },
};

const pageColors: Record<string, { light: string; dark: string }> = {
  '/': { light: '#0099FF', dark: '#0099FF' },
  '/providers': { light: '#0099FF', dark: '#0099FF' },
  '/payment-success': { light: '#00c853', dark: '#00c853' },
  '/admin/login': { light: '#0099FF', dark: '#0099FF' },
  '/admin': { light: '#0099FF', dark: '#0099FF' },
  '/history': { light: '#0099FF', dark: '#0099FF' },
  '/profile': { light: '#0099FF', dark: '#0099FF' },
  '/notifications': { light: '#0099FF', dark: '#0099FF' },
};

export const StatusBarColor = () => {
  const location = useLocation();
  const { theme } = useTheme();
  const { primary } = useBrand();

  useEffect(() => {
    let color = location.pathname === '/payment-success'
      ? pageColors['/payment-success'][theme]
      : primary;

    // Check if we have provider name in location state
    const providerName = (location.state as { providerName?: string })?.providerName?.toLowerCase().trim();
    if (providerName && providerColors[providerName]) {
      color = providerColors[providerName][theme];
    }

    // Update meta tag
    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'theme-color');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', color);
  }, [location.pathname, location.state, theme, primary]);

  return null;
};
