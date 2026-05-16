import { useEffect } from 'react';

export function useVisualViewport() {
  useEffect(() => {
    if (!window.visualViewport) return;
    
    const handleResize = () => {
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${window.visualViewport!.height}px`
      );
    };
    
    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();
    
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);
}
